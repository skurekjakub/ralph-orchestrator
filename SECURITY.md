# Security Hardening — Ralph Agent Containers

## Threat Model

The primary threat is **prompt injection** — a compromised AI agent executing arbitrary commands inside the container. Everything inside the container (workspace files, local state) is considered expendable and recoverable from git. The security controls focus on preventing damage **outside** the container: network exfiltration, lateral API abuse, and host compromise.

## Controls

### Network Isolation

Agent containers run on an **internal-only Docker network** (`internal: true`) with no direct internet route. All HTTP/HTTPS traffic is forced through a **Squid forward proxy sidecar** that enforces a domain allowlist.

```
┌──────────────────────┐     ┌──────────────────┐     ┌──────────┐
│  Agent Container     │     │  Squid Proxy     │     │ Internet │
│  (internal network)  │────▶│  (both networks) │────▶│          │
│  no direct egress    │     │  domain allowlist │     │          │
└──────────────────────┘     └──────────────────┘     └──────────┘
```

Even if the agent unsets `HTTPS_PROXY` env vars, direct egress fails — the internal network has no gateway to the internet. The proxy is the only bridge.

### Host Loopback Access

The agent can reach services running on the host machine (e.g. a RAG endpoint or local dev server) via `host.docker.internal`. Traffic goes through, and is filtered by, the Squid proxy — direct access from the internal network to the host is not possible.

```
Agent → HTTP_PROXY → Squid → host.docker.internal:<port> → host service
```

Allowed ports are configured in `shared/security/squid.conf` under the "Host loopback access" section:

```squid
acl host_loopback_ports port 4500        # ← add your ports here
```

To allow port 8080 (e.g. a local RAG API):

```squid
acl host_loopback_ports port 4500 8080
```

The agent then calls `http://host.docker.internal:8080/...`. Requests to unlisted ports are denied by the `deny host_loopback` fallback rule.

Both the `app` and `egress-proxy` containers have `extra_hosts: ["host.docker.internal:host-gateway"]` in the security overlay, ensuring the hostname resolves on all platforms.

> **Limitation:** Only HTTP/HTTPS traffic is supported (Squid is an HTTP proxy). For raw TCP services (e.g. a database), use a sidecar container on `ralph-internal` instead.

### Domain Allowlist

The allowlist (`shared/security/squid.conf`) permits only domains the agent needs:

| Category | Domains |
|---|---|
| AI/LLM backends | `.githubcopilot.com`, `.anthropic.com`, `api.github.com`, `github.com` |
| Azure infrastructure | `aka.ms` |
| Package registries | `.npmjs.org`, `.rubygems.org`, `.nuget.org`, `.pypi.org`, `.pythonhosted.org` |

Domains previously in the allowlist (JIRA, Azure DevOps, documentation sites) are now accessed exclusively through MCP tools running in the sidecar container, which has direct internet access via `ralph-sidecar-external`. The agent's Squid allowlist is intentionally minimal — only AI providers and package registries are needed for the agent itself.

All other domains are blocked. Squid access logs (allowed + denied) are collected per task for tuning.

### Container Hardening

| Control | Implementation | Why |
|---|---|---|
| No Docker socket | Removed from all compose volume mounts | Prevents container escape via Docker API |
| No sudo | Base image (`ubuntu:22.04`) does not include sudo; vscode user created without privilege escalation | Prevents privilege escalation to root |
| `cap_drop: ALL` | In security overlay compose file | Drops all Linux capabilities |
| `cap_add: DAC_OVERRIDE, CHOWN` | In security overlay compose file | Re-adds file permission bypass and ownership change capabilities — needed for cleanup of root-owned directories created by Docker volume mounts. NOTE: This is mainly to simplify Dockerfile setup requirements for now. Will be revised later. |
| `no-new-privileges: true` | In security overlay compose file | Prevents setuid/setgid privilege escalation |
| Resource limits | Memory: 8G, CPU: 4, PIDs: 500 | Prevents resource exhaustion attacks |
| User-writable npm prefix | `~/.npm-global` set via `NPM_CONFIG_PREFIX` | Allows `npm install -g` without root |

### Compose Merge Pattern

Security is applied via a **compose file merge** (up to three files):

1. **Base:** `profiles/<id>/docker-compose.yml` — services, volumes, build config
2. **Security overlay:** `shared/security/docker-compose.security.yml` — Squid sidecar, networks, limits, hardening
3. **Resources overlay:** `profiles/<id>/.build/docker-compose.overlay.yml` — MCP server mounts, env var passthrough, resource file mounts (auto-generated at startup, only included if present)

`ComposeClient` automatically injects all applicable files for every command. The security overlay adds:

- `egress-proxy` service (Squid on both internal and external networks)
- `ralph-internal` network (`internal: true`) — agent's only network
- `ralph-external` network — Squid's bridge to the internet
- Proxy env vars (`HTTP_PROXY`, `HTTPS_PROXY` and lowercase variants)
- Security options (`cap_drop`, `no-new-privileges`)
- Resource limits (`deploy.resources.limits`)

## Startup Validation

The `src/validate/security.ts` module checks on every startup:

- Security overlay compose file exists
- Squid config exists
- Base compose files reference `ralph-internal` network
- No `docker.sock` mounts in any compose file

## Log Collection for Allowlist Tuning

The `ContainerLogCollector` collects Squid access logs from the `egress-proxy` container after every task (including failed ones). Each log line shows:

```
timestamp elapsed_ms client_ip TCP_status/HTTP_code bytes method domain:port user HIER/peer_ip content_type
```

- `TCP_DENIED/403` — blocked by allowlist
- `TCP_TUNNEL/200` — HTTPS tunnel allowed
- `TCP_MISS/200` — HTTP request allowed

Proxy logs are saved in each task's subdirectory as `<key>-<startTs>-<ts>-proxy.log` within `output/logs/<key>-<startTs>/`.

## Prompt Injection Defense

The orchestrator builds the CLI prompt from work item data (description, comments, custom fields, handoff attachments). This data is user-provided and could contain adversarial instructions. Four defense layers mitigate this risk:

### Layer 1: Content Normalization (`src/prompt/normalizer.ts`)

Before untrusted content enters the prompt, it is normalized:

- **Invisible character removal** — zero-width spaces, joiners, BOM, bidirectional overrides, soft hyphens
- **HTML comment stripping** — removes `<!-- ... -->` blocks that could hide instructions from human review while remaining visible to the LLM
- **Non-standard whitespace normalization** — replaces non-breaking spaces, em spaces, ideographic spaces with regular spaces
- **Excessive blank line collapsing** — collapses runs of 4+ newlines to prevent off-screen content hiding

### Layer 2: Untrusted Data Delimiters (`src/prompt/prompt.ts`)

Untrusted content is wrapped in explicit delimiters:

```
JIRA Issue: DOC-123
Title: Fix typo in API docs

--- BEGIN UNTRUSTED DATA ---
Description: ...
Labels: ...
JIRA Comments: ...
--- END UNTRUSTED DATA ---
```

Agent template instructions (Layer 4) reference these delimiters to distinguish system instructions from user-provided data.

### Layer 3: Heuristic Pattern Scanner (`src/prompt/prompt-auditor.ts`)

A configurable scanner examines all untrusted prompt sections for common injection patterns:

| Category | Severity | Examples |
|---|---|---|
| Instruction override | Critical | "ignore previous instructions", "new instructions:" |
| Prompt format tokens | Critical | `<\|im_start\|>`, `[INST]`, `<<SYS>>` |
| Context hijacking | Critical | "forget everything", "reset your context" |
| Credential probing | Critical | "cat .env", "dump credentials", "print api key" |
| Git remote manipulation | Critical | "git remote add", "git remote set-url" to non-allowlisted hosts |
| Exfiltration commands | Critical | `curl`/`wget`/`fetch` with URLs |
| Role hijacking | Warning | "you are now", "pretend to be", "act as" |
| Suspicious URLs | Warning | URLs not in the domain allowlist |
| Base64 blocks | Warning | Large encoded payloads |
| Unicode control chars | Warning | Clusters of invisible formatting characters |
| Output manipulation | Warning | "do not reveal", "hide this from" |
| Delimiter flooding | Warning | Excessive `===`, backticks, dashes |

**Audit modes** (configured via `config.json` → `promptAudit.mode`):
- `"warn"` (default) — logs findings, continues execution
- `"block"` — throws an error for critical findings, stopping the task
- `"off"` — disables auditing

Each finding includes the pattern name, matched text (truncated), severity, and which JIRA field/comment triggered it.

### Layer 4: Agent Security Instructions (`shared/agent-includes/prompt-security.md`)

A shared Liquid partial injected into all top-level agent templates via `{% render 'prompt-security' %}`. It uses TemplateContext variables (`{{ taskId }}`, `{{ taskProject }}`) to scope the agent's authorization to a specific work item:

- Assigns the agent to a specific issue key and project, rejecting requests targeting other issues
- Treats content between `BEGIN/END UNTRUSTED DATA` delimiters strictly as task information
- Ignores embedded instructions or directives in untrusted data
- Never discloses credentials, environment variables, or secrets
- Only uses network endpoints required by the workflow
- Never adds, modifies, or removes git remotes
- Enforces branch scope lock — only works on branches related to the assigned issue
- Instructs meta-agents to tell sub-agents to never use `ask_questions`
- Reports suspected injection attempts in the handoff file

### Defense Philosophy

Prompt injection is **fundamentally unsolved at the model level**. No filtering, training, or detection technique reliably prevents it against adaptive attacks. These layers are **tripwire defenses** — they catch accidental or opportunistic injections and provide audit visibility. The real security boundary remains **architectural**: network isolation, domain allowlist proxy, container hardening, and privilege minimization.

## Runtime URL Enforcement

Domain-level allowlisting (Squid proxy) prevents the agent from reaching arbitrary servers, but an injected agent could still abuse *allowed* APIs to target different organizations or resources. URL **path** restrictions provide an additional enforcement layer.

### Threat Model

An attacker embeds a PAT (personal access token) in a JIRA issue description. The injected agent uses `curl` or a bash tool to call an allowlisted API (e.g., `dev.azure.com`) with the stolen PAT, targeting a different organization than the one Ralph is configured for. Domain-level filtering alone can't prevent this.

### Pre-Tool Hook Audit Logging (`shared/hooks/log-pre-tool.sh`)

A Copilot CLI pre-tool hook that runs **synchronously before every tool execution**. It logs every tool invocation to `pre-tool.log` (JSONL, streamed to host in real-time) and `audit.jsonl` for post-task analysis.

**Limitations:**
- Only applies to Copilot CLI (Claude Code has no equivalent hook protocol)
- Audit-only — does not block tool calls (URL enforcement is handled by the CLI URL allowlist and Squid proxy)

### Copilot CLI URL Allowlist (`copilot-config.json`)

The Copilot CLI's built-in URL permission system, configured via a generated config file. The CLI checks URLs at its own permission layer before tools execute.

At startup, the orchestrator:

1. Parses the profile's generated `squid.conf` for allowed domains
2. Applies path restrictions from MCP server manifests to sensitive domains (JIRA, ADO)
3. Includes host loopback ports from the squid config
4. Writes `copilot-config.json` with `allowed_urls` patterns

**URL pattern examples:**
- `https://*.github.com` — any GitHub subdomain, any path
- `https://api.atlassian.com/ex/jira/cloud-42/*` — only the configured JIRA cloud instance
- `https://dev.azure.com/MyOrg/*` — only the configured ADO organization
- `http://host.docker.internal:4500/*` — host loopback on specific port

The config is mounted read-only at `/workspace/.ralph/config.json` and read by the CLI via `--config-dir /workspace/.ralph`. The `--yolo` flag (which includes `--allow-all-urls`) is replaced with explicit `--allow-all-tools --allow-all-paths` to keep URL enforcement active.

**Limitations:**
- Only applies to Copilot CLI (Claude Code has no equivalent URL restriction config)
- Path wildcards are prefix-based (`/*` suffix) — exact path matching not available

### Path Restriction Auto-Derivation (`src/container/setup/url-restrictions.ts`)

Path restrictions are auto-derived at startup from MCP server manifests:

| Source | Rule | Restricts |
|---|---|---|
| JIRA cloud ID (`config.json`) | `api.atlassian.com` → `/ex/jira/{cloudId}/` | Agent can only access the configured JIRA instance |
| ADO MCP manifest (`shared/mcp-servers/ado/mcp-server.json`) | `dev.azure.com` → `/{orgName}/` | Agent can only access the configured ADO organization |

Rules are used to generate path-scoped `allowed_urls` in `copilot-config.json` (consumed by the CLI).

### Defense Layering Summary

```
┌─────────────────────────────────────────────────────────────────┐
│                      URL Access Control                         │
│                                                                 │
│  Layer 2: Squid Proxy (DOMAIN level — network enforcement)      │
│    └─ Blocks all traffic to non-allowlisted domains             │
│                                                                 │
│  Layer 1: Copilot CLI URL Allowlist (PATH level — CLI layer)    │
│    └─ Restricts tool URL access to path-scoped patterns         │
│                                                                 │
│  Audit: Pre-tool hook logs all tool calls for observability     │
│                                                                 │
│  Note: Layer 1 is Copilot-only. Claude Code relies on           │
│  Layer 2 (Squid) + the hook for audit logging only.             │
└─────────────────────────────────────────────────────────────────┘
```

## What the Agent Can Still Do

These are **by design** — the agent needs them to function:

- Read/write the mounted workspace (`/workspace`)
- Push to git remotes via Azure DevOps (PAT in env)
- Create PRs via ADO REST API
- Post comments and attach files to JIRA
- Make LLM API calls (Copilot, Anthropic)
- Install npm/gem packages from public registries (through the proxy)
- Run arbitrary commands inside the container (as unprivileged `vscode` user)

## What the Agent Cannot Do

- Access the Docker socket or control other containers
- Reach any domain not in the allowlist
- Escalate to root (no sudo, no setuid, no capabilities)
- Exhaust host resources beyond the limits
- Access the host filesystem outside the mounted workspace
- Install system packages (no apt/dpkg without root)

## FAQ

### How do I allow the agent to reach a new external domain?

Add it to the domain allowlist in `shared/security/squid.conf`:

```squid
acl allowed_domains dstdomain .example.com
```

Restart or rebuild the containers for the change to take effect. The domain will appear in proxy logs for verification.

### How do I expose a host service (e.g. local RAG endpoint) to the agent?

Add the port to the host loopback allowlist in `shared/security/squid.conf`:

```squid
acl host_loopback_ports port 4500 8080
```

The agent calls `http://host.docker.internal:8080/...` — traffic is routed through the Squid proxy. See [Host Loopback Access](#host-loopback-access) for details.

### How do I debug a blocked request?

Check the Squid proxy logs collected after each task (inside `output/logs/<key>-<startTs>/`). Look for `TCP_DENIED/403` entries — they show the blocked domain and port.

For live debugging during development, `docker compose logs egress-proxy` shows the Squid access log in real time.

### How do I change the audit mode for prompt injection scanning?

Set `promptAudit.mode` in `config.json`:

```json
{
  "promptAudit": {
    "mode": "block"   // "warn" (default) | "block" | "off"
  }
}
```

- **warn** — logs findings, continues execution
- **block** — stops the task on critical findings
- **off** — disables auditing entirely

### How do I allow a non-standard port for an external domain?

By default, Squid only allows ports 80 (HTTP) and 443 (HTTPS). To allow additional ports on external domains, add them to `Safe_ports` in `shared/security/squid.conf`:

```squid
acl Safe_ports port 8443
```

For HTTPS tunneling (`CONNECT`) on non-443 ports, also add to `SSL_ports`:

```squid
acl SSL_ports port 8443
```

### Can the agent make raw TCP connections (not HTTP)?

No. Squid is an HTTP proxy — it only handles HTTP and HTTPS (via `CONNECT` tunneling). For raw TCP services:

- If the service is on the host, run a sidecar container on `ralph-internal` that proxies TCP traffic.
- If the service is remote, consider an HTTP REST wrapper or a sidecar with a TCP proxy like `socat`.

### Does the security overlay apply to all profiles?

Yes. `ComposeClient` automatically merges `shared/security/docker-compose.security.yml` with every profile's base compose file. No per-profile opt-out exists by design.
