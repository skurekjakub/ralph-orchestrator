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
| Claude Code | `api.anthropic.com`                                  |
| Copilot CLI | `.githubcopilot.com`, `api.github.com`, `github.com` |

Claude Code's built-in web tools are allowed in container sessions. `WebSearch` runs server-side at Anthropic, so this allowlist does not apply to it. `WebFetch` fetches from the container through Squid, so it reaches only allowlisted domains; its domain safety check goes to `api.anthropic.com`.

When the organisation behind the Claude Code credential lists GitHub plugin marketplaces in its server-managed settings, Claude Code tries to clone them at startup. Squid denies `github.com` unless a Copilot stage of the same task adds it, and the session carries on.

Profiles add what their agent needs via `allowlistDomains` in `profile.json`. The bundled profiles add:

| Profile        | Added domains                                                                                                                                                       |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ralph-docs`   | `.aka.ms`, `.dev.azure.com`, `.artifacts.visualstudio.com`, `.blob.core.windows.net`, `.npmjs.org`, `.rubygems.org`, `.nuget.org`, `.pypi.org`, `.pythonhosted.org` |
| `ralph-vscode` | `.npmjs.org`, `dev.azure.com`, `pkgs.dev.azure.com`, `vsblob.dev.azure.com`, `.artifacts.visualstudio.com`                                                          |

JIRA, ADO REST, documentation sites and arbitrary web fetches are meant to go through MCP tools in the sidecar container, which has direct internet access via `ralph-sidecar-external`. Both bundled profiles put Azure DevOps domains on the agent's allowlist, though, so domain filtering alone does not stop the agent from calling ADO with a credential it holds.

All other domains are blocked. Squid access logs (allowed + denied) are collected per task for tuning.

### Container Hardening

| Control                        | Implementation                                                                                                                                                                                  | Why                                                                                                                                              |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| No Docker socket               | Removed from all compose volume mounts                                                                                                                                                          | Prevents container escape via Docker API                                                                                                         |
| No sudo                        | Profile images (`ralph-docs`: `ubuntu:22.04`, `ralph-vscode`: `node:24-bookworm-slim`) don't install sudo; the CLI runs as the unprivileged `vscode` user (`docker compose exec --user vscode`) | Prevents privilege escalation to root                                                                                                            |
| `cap_drop: ALL`                | In security overlay compose file                                                                                                                                                                | Drops all Linux capabilities                                                                                                                     |
| `cap_add: DAC_OVERRIDE, CHOWN` | In security overlay compose file                                                                                                                                                                | Re-adds file permission bypass and ownership change capabilities — needed for cleanup of root-owned directories created by Docker volume mounts. |
| `no-new-privileges: true`      | In security overlay compose file                                                                                                                                                                | Prevents setuid/setgid privilege escalation                                                                                                      |
| Resource limits                | Memory: 8G, CPU: 4, PIDs: 500                                                                                                                                                                   | Prevents resource exhaustion attacks                                                                                                             |
| User-writable npm prefix       | `~/.npm-global` set via `NPM_CONFIG_PREFIX`                                                                                                                                                     | Allows `npm install -g` without root                                                                                                             |
| Root-owned agent CLIs          | Claude Code and Copilot CLI are installed under `/usr/local` at image build, at the versions `package.json` pins, and run by absolute path                                                      | The agent cannot replace or patch its own CLI, and a CLI it installs under `~/.npm-global` never runs in its place                               |

### Compose Merge Pattern

Security is applied via a **compose file merge** (up to three files):

1. **Base:** `profiles/<id>/docker-compose.yml` — services, volumes, build config
2. **Security overlay:** `shared/security/docker-compose.security.yml` — Squid sidecar, networks, limits, hardening
3. **Resources overlay:** `profiles/<id>/.build/docker-compose.overlay.yml` — the build args, environment, credentials and mounts of the agent CLIs the variant's container stages run, the MCP sidecar service and resource file mounts (written at startup, rewritten before each task, included when present)

`ComposeClient` automatically injects all applicable files for every command. The security overlay adds:

- `egress-proxy` service (Squid on both internal and external networks)
- `ralph-internal` network (`internal: true`) — agent's only network
- `ralph-external` network — Squid's bridge to the internet
- `ralph-sidecar-external` network — the MCP sidecar's direct route to the internet
- Proxy env vars (`HTTP_PROXY`, `HTTPS_PROXY`, `NO_PROXY` and lowercase variants)
- Read-only mount of the audit hook scripts (`shared/hooks/` at `/workspace/.ralph/hooks`)
- Security options (`cap_drop: ALL`, `cap_add: DAC_OVERRIDE, CHOWN`, `no-new-privileges`)
- Resource limits (`deploy.resources.limits`)

### Credentials in the Agent Container

MCP server secrets (`ADO_PAT`, `JIRA_PAT_<KEY>`, `JIRA_EMAIL_<KEY>`, Discord and NodeBB tokens) are written to `gateway.json`, which is mounted only into the MCP sidecar; the agent container does not get them. It does get these credentials through its environment:

| Variable                                                                       | Source                                                                                                       | Containers                                                                  |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| `CLAUDE_CODE_OAUTH_TOKEN`, or `ANTHROPIC_API_KEY` with `claudeAuth: "api-key"` | Resources overlay, from the Claude Code runtime's `composeContribution` (`src/cli/claude/claude-runtime.ts`) | Tasks with a container stage that runs Claude Code; only the configured one |
| `GH_TOKEN`                                                                     | Resources overlay, from the Copilot runtime's `composeContribution` (`src/cli/copilot/copilot-runtime.ts`)   | Tasks with a container stage that runs Copilot CLI                          |
| `ADO_PAT_XPERIENCE`                                                            | `profiles/ralph-docs/docker-compose.yml`                                                                     | `ralph-docs` agent container                                                |

The overlay names each CLI credential as a `${VAR}` reference, so its value comes from the orchestrator's environment at compose time and never appears in a generated file. A prompt-injected agent can read these values. Combined with an allowlisted domain (`api.anthropic.com`, the Copilot domains, Azure DevOps hosts), it can use them directly.

### Agent CLI Sessions

Each container stage runs its CLI as `vscode` through `docker compose exec`, with the prompt on stdin.

- **Claude Code** (`src/container/cli-executors/claude-code-executor.ts`) runs with `--permission-mode bypassPermissions`, so no tool call waits for approval. What bounds it is the container, Squid, the sidecar's tool filter, the `--tools` cap and Ralph's hooks:
  - `--tools` caps the built-in tools at `Read`, `Write`, `Edit`, `Bash`, `Skill`, `TaskCreate`, `TaskGet`, `TaskList`, `TaskUpdate`, `WebFetch` and `WebSearch`, plus `Agent` for a stage root that spawns subagents. Each agent's frontmatter `tools` narrows that list further.
  - `--strict-mcp-config` with the generated `mcp-config.json`: the session runs only the sidecar's MCP servers, never one from the target repo.
  - `--setting-sources user` with `CLAUDE_CONFIG_DIR=/workspace/.ralph/claude` and `CLAUDE_CODE_DISABLE_CLAUDE_MDS=1`: neither the target repo's `CLAUDE.md` files nor its `.claude/` settings load. A profile that sets `claude.loadRepoInstructions` gets `--setting-sources user,project` and the repo's `CLAUDE.md` files.
  - Non-essential traffic (telemetry, error reporting, update checks), auto-update, auto memory and background tasks are off, so the session needs no domain besides the model API.
  - `--settings /etc/ralph/claude-settings.json` carries Ralph's hooks and attribution policy; see [Audit Hooks](#audit-hooks-sharedhooks).
- **Copilot CLI** (`src/container/cli-executors/copilot-executor.ts`) runs with `--allow-all-tools --allow-all-paths` under its URL allowlist (see [Copilot CLI URL Allowlist](#copilot-cli-url-allowlist-copilot-settingsjson)). Its bundled GitHub MCP server is off unless the profile sets `githubMcpTools`.

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

Proxy logs are saved in each task's subdirectory as `<key>-<startTs>-<ts>-proxy.log` within `output/logs/<key>-<startTs>/`; a multi-stage pipeline also saves one per container stage as `<key>-<startTs>-<ts>-<role>-proxy.log`.

## Transcripts, Logs and Redaction

Credentials are scrubbed in two places, both with the rules of `shared/hooks/lib/redact.pl` ([shared/hooks/README.md](shared/hooks/README.md#behaviour)): the literal values of credential-named variables in the environment the script runs in, well-known token formats, `Authorization` values, URL passwords and secret assignments.

- **By the audit hooks, as they write.** Every record in `audit.jsonl`, `pre-tool.log`, `tool-output.log` and `ralph.log` is scrubbed before it is written, against the hook's environment: the agent container's, or a Claude Code local-mode stage's, which holds only the credentials that session has.
- **On the host, by `RunArtifactsDeriver`** (`src/services/run-artifacts-deriver.ts`), against the orchestrator's own environment, which holds every secret from `.env`. It runs during result collection, once the stage pipeline has returned a result, whatever its status:
  - it redacts in place every transcript a CLI wrote itself (Copilot CLI's `--share` transcript, collected as `transcript` or, per stage, `<role>-transcript`);
  - it writes the transcript it renders from the Claude Code session logs already redacted;
  - only then is the `transcript` log attached to the JIRA issue.

  A CLI-written transcript whose redaction fails stays on disk unredacted, and is dropped from the collected logs, so it is never attached. A rendered transcript that cannot be redacted is not written.

When a task phase throws instead (preparing the workspace, compose up, setup, building a stage's executor), the task runner only collects the container logs. Nothing is redacted on the host, a Copilot transcript stays unredacted in `output/`, and nothing is attached.

Nothing scrubs these files, so treat them as holding secrets:

- the exported Claude Code session logs (`-claude-sessions/`) and Copilot CLI's session state (`-session-state/`) and session store (`-session-db`);
- the CLI debug logs (`-cli-debug.log`, `-claude-cli-debug.log`) and their live copy (`<key>-<startTs>-cli-debug-stream.log`);
- the proxy and sidecar logs, `-state.md` and the exported `-artifacts/`;
- the per-task log (`<key>-<startTs>-<ts>.log`) and the daily `container-YYYY-MM-DD.log`;
- the `stderr` and `agentText` snippets in the execution summary (`-summary.json`);
- in a local-mode stage's directory, everything besides the hooks' records: the CLI's debug log and its private home, which holds its session logs.

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

### Audit Hooks (`shared/hooks/`)

`log-pre-tool.sh` runs before every tool call, as Copilot CLI's `preToolUse` and Claude Code's `PreToolUse` hook. It logs every tool invocation to `pre-tool.log` (JSONL, streamed to the host in real time) and `audit.jsonl` for post-task analysis. The other hooks in `shared/hooks/` log session start and end, prompts, tool output, subagents, compactions and errors. Every hook scrubs credentials from what it writes (see [Transcripts, Logs and Redaction](#transcripts-logs-and-redaction)); their contract is in [shared/hooks/README.md](shared/hooks/README.md).

The scripts are mounted by the security overlay at `/workspace/.ralph/hooks/`. Each CLI's hook configuration comes from the generated overlay, only when a container stage runs that CLI:

- **Copilot CLI:** `shared/hooks/ralph-audit.json` at `/workspace/.github/hooks/ralph-audit.json`, the location Copilot CLI reads repository hooks from.
- **Claude Code:** `shared/hooks/claude/hooks.json`, embedded unchanged as the `hooks` of Ralph's session settings, which also remove Claude Code's commit and PR attribution. The settings are generated per task (`profiles/<id>/.build/claude/session-settings.json`), mounted read-only at `/etc/ralph/claude-settings.json`, outside the workspace and the Claude Code home, and passed to every session with `--settings`. Command-line settings outrank user and project settings, so neither the empty read-only user `settings.json` nor, with `claude.loadRepoInstructions`, the target repo's `.claude/settings.json` can change the attribution setting.

  Ralph's settings are not managed settings, so they cannot set `allowManagedHooksOnly`, which Claude Code honours only in managed settings. Hooks from other sources therefore run alongside Ralph's. With the default `--setting-sources user` there is no other writable source in the container. With `claude.loadRepoInstructions: true`, the target repo's `.claude/settings.json` loads too, and the agent can write that file: hooks in it run alongside Ralph's, but it cannot switch Ralph's off. Ralph's settings set `disableAllHooks: false`, and `--settings` outranks project and local settings ([hooks](https://code.claude.com/docs/en/hooks#disable-or-remove-hooks), [settings precedence](https://code.claude.com/docs/en/settings)), so a project `disableAllHooks: true` has no effect. Ralph does not use the managed settings file (`/etc/claude-code/managed-settings.json`) because Claude Code ignores it entirely whenever the credential's organisation delivers server-managed settings.

  Server-managed settings apply on top regardless. When the Team or Enterprise organisation behind the OAuth token or API key delivers settings from the claude.ai admin console, they outrank `--settings` ([server-managed settings](https://code.claude.com/docs/en/server-managed-settings)), and nothing in the container can prevent it: an organisation `attribution` value replaces Ralph's, and `allowManagedHooksOnly` or `disableAllHooks` stops Ralph's hooks. After each Claude Code container stage the orchestrator looks for the stage session's `session_start` record in the audit log. When it is missing, the orchestrator logs a warning and lists the session under `hooklessSessions` in the task's execution summary; the task still finishes.

**Limitations:**

- Run by Copilot CLI and Claude Code in the container, and by Claude Code in local-mode stages (from the host's `shared/hooks/`, writing to the stage's `logs/`). Copilot CLI in local-mode stages runs without them.
- Audit-only — no hook blocks a tool call, a prompt or a stop.

### Copilot CLI URL Allowlist (`copilot-settings.json`)

The Copilot CLI's built-in URL permission system, configured via a generated settings file. The CLI checks URLs at its own permission layer before tools execute.

Before each task whose container stages run Copilot CLI, `writeCopilotSettings()` (`src/cli/copilot/copilot-settings.ts`):

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
│  Claude Code WebSearch (runs at Anthropic), local-mode stages   │
│  (run on the host).                                             │
└─────────────────────────────────────────────────────────────────┘
```

### Local-Mode Stages

Stages with `mode: "local"` — including every post-task hook stage — run Claude Code (`LocalClaudeCodeExecutor`) or Copilot CLI (`LocalCopilotExecutor`) directly on the orchestrator host. None of the container controls in this document (network isolation, Squid, capability drop, resource limits) apply to them. What fences them in instead:

- **Own workspace.** Each stage runs in `<outputDir>/hooks/<hook>/<role>/` or `<outputDir>/stages/<role>/`, with a private CLI home, so the host user's own CLI settings, hooks, plugins, agents, skills, memory, login and MCP servers stay out and nothing the stage writes lands in the orchestrator checkout.
- **Pinned CLI.** The stage runs `node_modules/.bin/<cli>` at the version `package.json` pins, never a CLI on `PATH`; startup validation checks it.
- **No secrets.** The CLI starts with `extendEnv: false`: `PATH`, `HOME`, `LANG` and its own credential only. `ADO_PAT`, the `JIRA_*` credentials and other CLIs' tokens never reach it or its tools.
- **Claude Code** loads no `CLAUDE.md` (`CLAUDE_CODE_DISABLE_CLAUDE_MDS=1`, `--setting-sources user` in its private home) and no MCP server, has no `WebFetch`/`WebSearch` in its `--tools` cap, runs Ralph's audit hooks, and runs in `dontAsk` mode under generated permission rules (`src/cli/claude/claude-host-settings.ts`), which deny any tool call no allow rule covers. It reads its working directory, the task's output directory, the task's workspace (variant stages only), the task profile's `agents/` and the orchestrator's `shared/agent-includes`, `shared/skills` and `shared/mcp-servers`, and `blockReadsOutsideWorkingDirectories` makes its file tools and the Bash commands Claude Code recognises as reading files refuse any other path; writes only in its working directory and its artifact directory; may run Claude Code's built-in read-only Bash commands plus `jq` and `date`; may spawn only the stage's own subagents; and may not read the orchestrator's `.env` or any profile's `.build/`, where `gateway.json` holds the MCP credentials.
  - Remaining Bash gap: the read fence and the deny rules bind only the Bash commands that name the file they read. `jq`, which Ralph allows, is not documented as such a command, so it may read any file the host user can, and a recursive `grep` run from a readable directory is not bound by the deny rules. With no network tool and no secret in its environment besides its own credential, what it reads can reach only the model provider and the stage's own output files.
- **Copilot CLI** runs with `--allow-all-tools` and one `--add-dir` per directory it may read (the same as Claude Code's), its home at `COPILOT_HOME` in the stage's workspace and auto-update off. Its working directory is a git repository of its own, so it loads none of the orchestrator checkout's instructions, agents or skills. It gets no URL allowlist and no audit hooks.
- **No live edits.** The `agent-improver` subagent of the `run-analysis` hook writes proposed files into the hook's artifact directory; a maintainer applies them by pull request.

## What the Agent Can Still Do

These are **by design** — the agent needs them to function:

- Read/write the mounted workspace (`/workspace`)
- Push the task branch and create PRs through the `ado` MCP tools (the ADO PAT stays in the sidecar)
- Post comments and attach files to JIRA through the `jira-kentico` MCP tools
- Call the allowlisted tools (manifest `tools`) of its effective MCP servers, including `web-fetch` and `playwright` where declared — these run in the sidecar, which has unrestricted internet access
- Read the credentials in its environment (the credential of each CLI its container stages run, and `ADO_PAT_XPERIENCE` for `ralph-docs`) and use them against allowlisted domains
- Call the model API of each CLI its container stages run (`api.anthropic.com`, the Copilot domains)
- Search the web with Claude Code's `WebSearch`, which runs at Anthropic outside the allowlist, and fetch allowlisted pages with `WebFetch`
- Install packages from the registries on its profile's allowlist (through the proxy)
- Run arbitrary commands inside the container (as unprivileged `vscode` user)

## What the Agent Cannot Do

- Access the Docker socket or control other containers
- Reach a domain outside its task's allowlist directly (`WebSearch` runs at Anthropic, and MCP tools in the sidecar are not subject to the allowlist)
- Call an MCP tool outside the `tools` allowlist of a server that has one, or reach such a server other than through its tool-filter proxy
- Escalate to root (no sudo, no setuid; only `DAC_OVERRIDE` and `CHOWN` capabilities are kept)
- Exhaust host resources beyond the limits
- Access the host filesystem outside the mounted workspace, the attachments exchange directory (`/tmp/mcp-attachments`) and the read-only mounts (CLI settings, rendered agents, skills, MCP config, hooks, resources)
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

The orchestrator reads `profile.json` once at startup, so restart it after editing `allowlistDomains`. Every task regenerates the profile's `squid.conf` (and `copilot-settings.json` when a container stage runs Copilot CLI) from the baseline and the profile, so a baseline edit applies from the next task. The domain will appear in proxy logs for verification.

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
