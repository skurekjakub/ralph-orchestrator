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

Each profile gets its own `squid.conf` (`profiles/<id>/.build/squid.conf`), regenerated before every task from the shared baseline, the domains of the agent CLIs the variant's container stages run, and the profile's `allowlistDomains` (`src/container/setup/squid-config.ts`).

The baseline (`shared/security/squid.conf`) allows no AI provider. Each agent CLI adds its own backend, only for tasks whose container stages run it (`ICliRuntime.egressDomains`):

| Agent CLI   | Domains                                              |
| ----------- | ---------------------------------------------------- |
| Claude Code | `.anthropic.com`                                     |
| Copilot CLI | `.githubcopilot.com`, `api.github.com`, `github.com` |

Claude Code's built-in web tools are allowed in container sessions. `WebSearch` runs server-side at Anthropic, so this allowlist does not apply to it. `WebFetch` fetches from the container through Squid, so it reaches only allowlisted domains, unless Claude Code fetches server-side.

Profiles add what their agent needs via `allowlistDomains` in `profile.json`. The bundled profiles add:

| Profile        | Added domains                                                                                                                                                       |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ralph-docs`   | `.aka.ms`, `.dev.azure.com`, `.artifacts.visualstudio.com`, `.blob.core.windows.net`, `.npmjs.org`, `.rubygems.org`, `.nuget.org`, `.pypi.org`, `.pythonhosted.org` |
| `ralph-vscode` | `.npmjs.org`, `dev.azure.com`, `pkgs.dev.azure.com`, `vsblob.dev.azure.com`, `.artifacts.visualstudio.com`                                                          |

JIRA, ADO REST, documentation sites and arbitrary web fetches are meant to go through MCP tools in the sidecar container, which has direct internet access via `ralph-sidecar-external`. Both bundled profiles still put Azure DevOps domains on the agent's allowlist, so domain filtering alone does not stop the agent from calling ADO with a credential it holds.

All other domains are blocked. Squid access logs (allowed + denied) are collected per task for tuning.

### Container Hardening

| Control                        | Implementation                                                                                                                                                                                  | Why                                                                                                                                                                                                                                             |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No Docker socket               | Removed from all compose volume mounts                                                                                                                                                          | Prevents container escape via Docker API                                                                                                                                                                                                        |
| No sudo                        | Profile images (`ralph-docs`: `ubuntu:22.04`, `ralph-vscode`: `node:24-bookworm-slim`) don't install sudo; the CLI runs as the unprivileged `vscode` user (`docker compose exec --user vscode`) | Prevents privilege escalation to root                                                                                                                                                                                                           |
| `cap_drop: ALL`                | In security overlay compose file                                                                                                                                                                | Drops all Linux capabilities                                                                                                                                                                                                                    |
| `cap_add: DAC_OVERRIDE, CHOWN` | In security overlay compose file                                                                                                                                                                | Re-adds file permission bypass and ownership change capabilities — needed for cleanup of root-owned directories created by Docker volume mounts. NOTE: This is mainly to simplify Dockerfile setup requirements for now. Will be revised later. |
| `no-new-privileges: true`      | In security overlay compose file                                                                                                                                                                | Prevents setuid/setgid privilege escalation                                                                                                                                                                                                     |
| Resource limits                | Memory: 8G, CPU: 4, PIDs: 500                                                                                                                                                                   | Prevents resource exhaustion attacks                                                                                                                                                                                                            |
| User-writable npm prefix       | `~/.npm-global` set via `NPM_CONFIG_PREFIX`                                                                                                                                                     | Allows `npm install -g` without root                                                                                                                                                                                                            |

### Compose Merge Pattern

Security is applied via a **compose file merge** (up to three files):

1. **Base:** `profiles/<id>/docker-compose.yml` — services, volumes, build config
2. **Security overlay:** `shared/security/docker-compose.security.yml` — Squid sidecar, networks, limits, hardening
3. **Resources overlay:** `profiles/<id>/.build/docker-compose.overlay.yml` — MCP sidecar service, agent env vars, agent/skill/resource file mounts (generated at startup and regenerated per task, only included if present)

`ComposeClient` automatically injects all applicable files for every command. The security overlay adds:

- `egress-proxy` service (Squid on both internal and external networks)
- `ralph-internal` network (`internal: true`) — agent's only network
- `ralph-external` network — Squid's bridge to the internet
- `ralph-sidecar-external` network — the MCP sidecar's direct route to the internet
- Proxy env vars (`HTTP_PROXY`, `HTTPS_PROXY` and lowercase variants)
- Read-only audit hook mounts (`shared/hooks/`)
- Security options (`cap_drop: ALL`, `cap_add: DAC_OVERRIDE, CHOWN`, `no-new-privileges`)
- Resource limits (`deploy.resources.limits`)

### Credentials in the Agent Container

MCP server secrets (`ADO_PAT`, `JIRA_PAT_<KEY>`, `JIRA_EMAIL_<KEY>`, Discord and NodeBB tokens) are written to `gateway.json`, which is mounted only into the MCP sidecar; the agent container does not get them. It does get these credentials through its environment:

| Variable            | Source                                                       | Containers                             |
| ------------------- | ------------------------------------------------------------ | -------------------------------------- |
| `GH_TOKEN`          | Resources overlay (`src/container/setup/compose-overlay.ts`) | Every agent container                  |
| `ANTHROPIC_API_KEY` | Resources overlay (`src/container/setup/compose-overlay.ts`) | Every agent container (empty if unset) |
| `ADO_PAT_XPERIENCE` | `profiles/ralph-docs/docker-compose.yml`                     | `ralph-docs` agent container           |

A prompt-injected agent can read these values. Combined with an allowlisted domain (`api.github.com`, `github.com`, Azure DevOps hosts), it can use them directly.

### MCP Sidecar Tool Allowlists

The MCP sidecar is the enforcement boundary for MCP tools. The agent can open connections to the sidecar from `ralph-internal`, so nothing the CLI does with `mcp-config.json` restricts it; only the sidecar does. Three rules hold it:

- **Every way in goes through the tool-filter proxy.** For a server whose manifest lists `tools`, the agent-facing `sidecarPort` is served by the gateway's tool-filter proxy, which hides every other tool from `tools/list` and refuses calls to it (JSON-RPC `-32602`). It checks the bytes it forwards: only `application/json` in UTF-8 (anything else is HTTP 415), no repeated object keys, and the server receives exactly the inspected bytes under a content type the proxy sets.
- **Upstreams are loopback-only.** A filtered custom server listens on `127.0.0.1:<sidecarPort + 10000>`; an npm (stdio) server has no listener at all, because the gateway bridges it over stdio in process. The health endpoint listens on `127.0.0.1:9000`. npm manifests must list `tools`, and a `tools` list must not be empty.
- **The sidecar fails closed.** `/health` stays 503 until every filtered server's tools have been listed and its upstream has been probed unreachable on every non-loopback address, and compose starts the agent only on `service_healthy`. A custom server whose upstream port answers off loopback is refused: the gateway logs why, stops it for good, and its proxy answers 503.

A custom server without `tools` exposes every tool it registers, on `sidecarPort` directly.

## Startup Validation

The `src/validate/security.ts` module checks on every startup:

- Security overlay compose file exists
- Squid config exists
- Each profile's `docker-compose.yml` references the `ralph-internal` network
- No profile's `docker-compose.yml` mounts `docker.sock`

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

The orchestrator builds the CLI prompt from work item data (description, comments, custom fields, handoff attachments). This data is user-provided and could contain adversarial instructions. Three defense layers mitigate this risk:

### Layer 1: Content Normalization (`src/prompt/normalizer.ts`)

Before untrusted content enters the prompt, it is normalized:

- **Invisible character removal** — zero-width spaces, joiners, BOM, bidirectional overrides, soft hyphens
- **HTML comment stripping** — removes `<!-- ... -->` blocks that could hide instructions from human review while remaining visible to the LLM
- **Non-standard whitespace normalization** — replaces non-breaking spaces, em spaces, ideographic spaces with regular spaces
- **Excessive blank line collapsing** — collapses runs of 4+ newlines to prevent off-screen content hiding

The prompt (`src/prompt/prompt.ts`) places the normalized description, labels, components, priority, custom fields and comments after a `JIRA Issue:` / `Title:` header, without delimiters. Agent instructions (Layer 3) tell the agent to treat that data as task information.

### Layer 2: Heuristic Pattern Scanner (`src/prompt/prompt-auditor.ts`)

A configurable scanner examines all untrusted prompt sections for common injection patterns:

| Category                | Severity | Examples                                                                                                                  |
| ----------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------- |
| Instruction override    | Critical | "ignore previous instructions", "new instructions:"                                                                       |
| Prompt format tokens    | Critical | `<\|im_start\|>`, `[INST]`, `<<SYS>>`                                                                                     |
| Context hijacking       | Critical | "forget everything", "reset your context"                                                                                 |
| Credential probing      | Critical | "cat .env", "dump credentials", "print api key"                                                                           |
| Git remote manipulation | Critical | "git remote add", "git remote set-url", `git clone` from hosts other than `dev.azure.com` / `github.com`                  |
| Exfiltration commands   | Critical | `curl`/`wget`/`fetch` with URLs                                                                                           |
| Role hijacking          | Warning  | "you are now", "pretend to be", "act as"                                                                                  |
| Suspicious URLs         | Warning  | URLs outside a fixed host list (`api.atlassian.com`, `dev.azure.com`, `github.com`, `registry.npmjs.org`, `rubygems.org`) |
| Base64 blocks           | Warning  | Large encoded payloads                                                                                                    |
| Unicode control chars   | Warning  | Clusters of invisible formatting characters                                                                               |
| Output manipulation     | Warning  | "do not reveal", "hide this from"                                                                                         |
| Delimiter flooding      | Warning  | Excessive `===`, backticks, dashes                                                                                        |

**Audit modes** (configured via `config.json` → `promptAudit.mode`):

- `"warn"` (default) — logs findings, continues execution
- `"block"` — throws an error for critical findings, stopping the task
- `"off"` — disables auditing

Each finding includes the pattern name, matched text (truncated), severity, and which JIRA field/comment triggered it.

### Layer 3: Agent Security Instructions (`shared/agent-includes/prompt-security.md`)

A shared Liquid partial rendered into the top-level agent templates (`ralph.ralph`, `ralph.malph`, `ralph.stacky`) and some subagents via `{% render 'prompt-security' %}`. It uses TemplateContext variables (`{{ taskId }}`, `{{ taskProject }}`) to scope the agent's authorization to a specific work item:

- Assigns the agent to a specific issue key and project, rejecting requests targeting other issues
- Treats issue data in the prompt (description, comments, custom fields, attachments) strictly as task information
- Ignores embedded instructions or directives in task data and tool output
- Never discloses credentials, environment variables, or secrets
- Only uses network endpoints required by the workflow
- Never adds, modifies, or removes git remotes
- Enforces branch scope lock — only works on branches related to the assigned issue
- Reports suspected injection attempts in the handoff file under "Security Notes"

### Defense Philosophy

Prompt injection is **fundamentally unsolved at the model level**. No filtering, training, or detection technique reliably prevents it against adaptive attacks. These layers are **tripwire defenses** — they catch accidental or opportunistic injections and provide audit visibility. The real security boundary remains **architectural**: network isolation, domain allowlist proxy, container hardening, and privilege minimization, with the credential gaps listed under [Credentials in the Agent Container](#credentials-in-the-agent-container).

## Runtime URL Enforcement

Both URL controls work at **domain** level. Neither restricts URL paths, so neither can confine the agent to one JIRA instance or one Azure DevOps organization.

### Threat Model

An attacker embeds a PAT (personal access token) in a JIRA issue description, or the agent reads one from its own environment (see [Credentials in the Agent Container](#credentials-in-the-agent-container)). The injected agent uses `curl` or a bash tool to call an allowlisted API (e.g., `dev.azure.com` for profiles that allow it) with that PAT, targeting a different organization than the one Ralph is configured for. The controls below do not prevent this; the pre-tool hook only records it.

### Pre-Tool Hook Audit Logging (`shared/hooks/log-pre-tool.sh`)

A Copilot CLI `preToolUse` hook that runs before every tool execution. It logs every tool invocation to `pre-tool.log` (JSONL, streamed to the host in real time) and `audit.jsonl` for post-task analysis. The other hooks in `shared/hooks/` log session start/end, prompts, tool output and errors.

The scripts are mounted by the security overlay at `/workspace/.ralph/hooks/`. Each CLI's hook configuration comes from the generated overlay, only when a container stage runs that CLI:

- **Copilot CLI:** `shared/hooks/ralph-audit.json` at `/workspace/.github/hooks/ralph-audit.json`, the location Copilot CLI reads repository hooks from.
- **Claude Code:** `shared/hooks/claude/hooks.json`, embedded unchanged as the `hooks` of Ralph's session settings, which also remove Claude Code's commit and PR attribution. The settings are generated per task (`profiles/<id>/.build/claude/session-settings.json`), mounted read-only at `/etc/ralph/claude-settings.json`, outside the workspace and the Claude Code home, and passed to every session with `--settings`. Command-line settings outrank user and project settings, so neither the empty read-only user `settings.json` nor, with `claude.loadRepoInstructions`, the target repo's `.claude/settings.json` can change the attribution setting.

  Ralph's settings are not managed settings, so they cannot set `allowManagedHooksOnly`, which Claude Code honours only in managed settings. Hooks from other sources therefore run alongside Ralph's. With the default `--setting-sources user` there is no other writable source in the container. With `claude.loadRepoInstructions: true`, the target repo's `.claude/settings.json` loads too, and the agent can write that file: hooks and hook settings in it apply alongside Ralph's. Ralph does not use the managed settings file (`/etc/claude-code/managed-settings.json`) because Claude Code ignores it entirely whenever the credential's organisation delivers server-managed settings.

  Server-managed settings still apply on top. When the Team or Enterprise organisation behind the OAuth token or API key delivers settings from the claude.ai admin console, they outrank `--settings` ([server-managed settings](https://code.claude.com/docs/en/server-managed-settings)), and nothing in the container can prevent it: an organisation `attribution` value replaces Ralph's, and `allowManagedHooksOnly` or `disableAllHooks` stops Ralph's hooks and the result gate. After each Claude Code container stage the orchestrator looks for the stage session's `session_start` record in the audit log. When it is missing, the orchestrator logs a warning and lists the session under `hooklessSessions` in the task's execution summary; the task still finishes.

**Limitations:**

- Run by Copilot CLI and Claude Code in the container. Local-mode stages don't get these hooks.
- Audit-only — the hook never blocks a tool call.

### Copilot CLI URL Allowlist (`copilot-settings.json`)

The Copilot CLI's built-in URL permission system, configured via a generated settings file. The CLI checks URLs at its own permission layer before tools execute.

Before each task, `writeCopilotSettings()` (`src/cli/copilot/copilot-settings.ts`):

1. Parses the profile's generated `squid.conf` for allowed domains
2. Converts each domain to a URL pattern: `.example.com` → `https://*.example.com`, `api.github.com` → `https://api.github.com`
3. Adds `http://host.docker.internal:<port>/*` for each host loopback port in the squid config
4. Writes `copilot-settings.json` with the `allowedUrls` patterns and `experimental: true`

It throws when the profile's `squid.conf` is missing. The allowlist therefore mirrors the Squid domain allowlist. It adds no path scoping.

The settings are mounted read-only at `/workspace/.ralph/settings.json`, and `COPILOT_HOME=/workspace/.ralph` makes the CLI read them. The CLI runs with `--allow-all-tools --allow-all-paths` instead of `--yolo` (which includes `--allow-all-urls`), so URL checks stay active.

**Limitations:**

- Applies only to the Copilot CLI running in the container. Local-mode stages don't get it.
- Domain-level only — any path on an allowlisted domain is permitted.

### Defense Layering Summary

```
┌─────────────────────────────────────────────────────────────────┐
│                      URL Access Control                         │
│                                                                 │
│  Squid Proxy (DOMAIN level — network enforcement)               │
│    └─ Blocks all agent traffic to non-allowlisted domains       │
│                                                                 │
│  Copilot CLI URL Allowlist (DOMAIN level — CLI layer)           │
│    └─ Same domains as Squid, checked before tools execute       │
│                                                                 │
│  Audit: Pre-tool hook logs all tool calls for observability     │
│                                                                 │
│  Not covered: MCP sidecar traffic (direct internet access),     │
│  local-mode stages (run on the host).                           │
└─────────────────────────────────────────────────────────────────┘
```

### Local-Mode Stages

Stages with `mode: "local"` — including every post-task hook stage — run the Copilot CLI directly on the orchestrator host via `LocalCopilotExecutor`. They run in the orchestrator repo root with `--allow-all-tools --allow-all-paths` and inherit the orchestrator's environment, including the secrets loaded from `.env`. They read the host user's own Copilot settings, so they get neither the `copilot-settings.json` URL allowlist nor the audit hooks. None of the container controls in this document (network isolation, Squid, capability drop, resource limits) apply to them.

## What the Agent Can Still Do

These are **by design** — the agent needs them to function:

- Read/write the mounted workspace (`/workspace`)
- Push the task branch and create PRs through the `ado` MCP tools (the ADO PAT stays in the sidecar)
- Post comments and attach files to JIRA through the `jira-kentico` MCP tools
- Call the allowlisted tools (manifest `tools`) of its effective MCP servers, including `web-fetch` and `playwright` where declared — these run in the sidecar, which has unrestricted internet access
- Read the credentials in its environment (`GH_TOKEN`, `ANTHROPIC_API_KEY`, and `ADO_PAT_XPERIENCE` for `ralph-docs`) and use them against allowlisted domains
- Make LLM API calls (Copilot, Anthropic)
- Install packages from the registries on its profile's allowlist (through the proxy)
- Run arbitrary commands inside the container (as unprivileged `vscode` user)

## What the Agent Cannot Do

- Access the Docker socket or control other containers
- Reach a domain outside its profile's allowlist directly (MCP tools in the sidecar are not subject to the allowlist)
- Call an MCP tool outside its server's `tools` allowlist, or reach an MCP server other than through its tool-filter proxy
- Escalate to root (no sudo, no setuid; only `DAC_OVERRIDE` and `CHOWN` capabilities are kept)
- Exhaust host resources beyond the limits
- Access the host filesystem outside the mounted workspace and the read-only mounts (rendered agents, skills, MCP config, hooks, resources)
- Install system packages (no apt/dpkg without root)

These limits apply to container stages only; see [Local-Mode Stages](#local-mode-stages).

## FAQ

### How do I allow the agent to reach a new external domain?

For one profile, add it to `allowlistDomains` in `profiles/<id>/profile.json`:

```json
"allowlistDomains": [".example.com"]
```

For all profiles, add it to the baseline allowlist in `shared/security/squid.conf`:

```squid
acl allowed_domains dstdomain .example.com
```

Restart the orchestrator so it regenerates the profile's `squid.conf` and `copilot-settings.json`. The domain will appear in proxy logs for verification.

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
    "mode": "block" // "warn" (default) | "block" | "off"
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
