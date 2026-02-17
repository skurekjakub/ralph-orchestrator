

  

Security analysis of Docker container

Read [](file:///home/jakubs/repositories/ralph-orchestrator/.github/instructions/meta.instructions.md)

Read [](file:///home/jakubs/repositories/ralph-orchestrator/profiles/ralph-docs/docker-compose.yml)

Read [](file:///home/jakubs/repositories/ralph-orchestrator/profiles/ralph-docs/Dockerfile)

Read [](file:///home/jakubs/repositories/ralph-orchestrator/profiles/ralph-docs/setup.sh)

Read [](file:///home/jakubs/repositories/ralph-orchestrator/profiles/ralph-vscode/docker-compose.yml)

Read [](file:///home/jakubs/repositories/ralph-orchestrator/profiles/ralph-vscode/Dockerfile)

Read [](file:///home/jakubs/repositories/ralph-orchestrator/profiles/ralph-vscode/setup.sh)

Read [](file:///home/jakubs/repositories/ralph-orchestrator/src/container/compose-client.ts)

Read [](file:///home/jakubs/repositories/ralph-orchestrator/src/container/manager.ts)

Read [](file:///home/jakubs/repositories/ralph-orchestrator/src/container/copilot-executor.ts)

Read [](file:///home/jakubs/repositories/ralph-orchestrator/src/container/claude-code-executor.ts)

Read [](file:///home/jakubs/repositories/ralph-orchestrator/src/container/types.ts)

Searched for regex `privileged|cap_add|security_opt|cap_drop|read_only|no-new-privileges|seccomp|apparmor`, no results

Searched for regex `mem_limit|cpus|cpu_shares|deploy.*resources|ulimits|pids_limit`, no results

Searched for text `docker.sock`, 4 results

Searched for regex `dns|network_mode|extra_hosts`, 4 results

Read [](file:///home/jakubs/repositories/ralph-orchestrator/profiles/ralph-docs/profile.json)

Read [](file:///home/jakubs/repositories/ralph-orchestrator/profiles/ralph-vscode/profile.json)

Searched for regex `MSSQL_SA_PASSWORD|Password123`, 7 results

Read [](file:///home/jakubs/.vscode-server/data/User/workspaceStorage/90b6c2e4d6a72aa7a526724625e44546/GitHub.copilot-chat/chat-session-resources/62c53f4e-72f1-4751-84c1-74e608f96526/toolu_01Bik7fDtJ6ki1qJ35tCuHa2__vscode-1771329326407/content.txt)

Now let me check what actually uses the Docker socket inside the container: 

Docker socket usage analysis

Read [](file:///home/jakubs/repositories/ralph-orchestrator/.github/instructions/meta.instructions.md)

Read [](file:///home/jakubs/repositories/ralph-orchestrator/profiles/ralph-docs/setup.sh)

Read [](file:///home/jakubs/repositories/ralph-orchestrator/profiles/ralph-vscode/setup.sh)

Read [](file:///home/jakubs/repositories/ralph-orchestrator/profiles/ralph-docs/Dockerfile)

Read [](file:///home/jakubs/repositories/ralph-orchestrator/profiles/ralph-vscode/Dockerfile)

Searched for files matching `**/profiles/ralph-docs/agents/**`, 5 matches

Searched for files matching `**/profiles/ralph-vscode/agents/**`, 3 matches

Read [](file:///home/jakubs/repositories/ralph-orchestrator/profiles/ralph-docs/agents/ralph.ralph.agent.md)

Read [](file:///home/jakubs/repositories/ralph-orchestrator/profiles/ralph-docs/agents/ralph.ralph-researcher.agent.md)

Read [](file:///home/jakubs/repositories/ralph-orchestrator/profiles/ralph-docs/agents/ralph.ralph-reviewer.agent.md)

Read [](file:///home/jakubs/repositories/ralph-orchestrator/profiles/ralph-docs/agents/ralph.malph.agent.md)

Read [](file:///home/jakubs/repositories/ralph-orchestrator/profiles/ralph-docs/agents/ralph.malph-investigator.agent.md)

Read [](file:///home/jakubs/repositories/ralph-orchestrator/profiles/ralph-vscode/agents/ralph.ralph.agent.md)

Read [](file:///home/jakubs/repositories/ralph-orchestrator/profiles/ralph-vscode/agents/ralph.malph.agent.md)

Read [](file:///home/jakubs/repositories/ralph-orchestrator/profiles/ralph-vscode/agents/ralph.ralph-analyst.agent.md)

Searched for regex `docker|docker\.sock|container` (`**/shared/agent-includes/**`), 1 result

Searched for regex `docker|docker\.sock|container` (`**/profiles/**`), 42 results

Read [](file:///home/jakubs/repositories/ralph-orchestrator/profiles/ralph-docs/docker-compose.yml)

Read [](file:///home/jakubs/repositories/ralph-orchestrator/profiles/ralph-vscode/docker-compose.yml)

Searched for regex `docker\.sock|docker socket` (`**/src/**`), no results

Searched for regex `docker` (`**/shared/hooks/**`), no results

Now let me check the exact network endpoints the agent needs to reach: 

Network endpoint requirements analysis

Read [](file:///home/jakubs/repositories/ralph-orchestrator/.github/instructions/meta.instructions.md)

Read [](file:///home/jakubs/repositories/ralph-orchestrator/shared/agent-includes/jira-api.md)

Read [](file:///home/jakubs/repositories/ralph-orchestrator/shared/agent-includes/ado-api.md)

Read [](file:///home/jakubs/repositories/ralph-orchestrator/shared/agent-includes/ado-pr-format.md)

Read [](file:///home/jakubs/repositories/ralph-orchestrator/profiles/ralph-docs/setup.sh)

Read [](file:///home/jakubs/repositories/ralph-orchestrator/profiles/ralph-vscode/setup.sh)

Searched for files matching `**/profiles/ralph-docs/agents/*.agent.md`, 5 matches

Searched for files matching `**/profiles/ralph-vscode/agents/*.agent.md`, 3 matches

Read [](file:///home/jakubs/repositories/ralph-orchestrator/profiles/ralph-docs/agents/ralph.ralph.agent.md)

Read [](file:///home/jakubs/repositories/ralph-orchestrator/profiles/ralph-docs/agents/ralph.ralph-researcher.agent.md)

Read [](file:///home/jakubs/repositories/ralph-orchestrator/profiles/ralph-docs/agents/ralph.ralph-reviewer.agent.md)

Read [](file:///home/jakubs/repositories/ralph-orchestrator/profiles/ralph-docs/agents/ralph.malph.agent.md)

Read [](file:///home/jakubs/repositories/ralph-orchestrator/profiles/ralph-docs/agents/ralph.malph-investigator.agent.md)

Read [](file:///home/jakubs/repositories/ralph-orchestrator/profiles/ralph-vscode/agents/ralph.ralph.agent.md)

Read [](file:///home/jakubs/repositories/ralph-orchestrator/profiles/ralph-vscode/agents/ralph.malph.agent.md)

Read [](file:///home/jakubs/repositories/ralph-orchestrator/profiles/ralph-vscode/agents/ralph.ralph-analyst.agent.md)

Read [](file:///home/jakubs/repositories/ralph-orchestrator/profiles/ralph-docs/Dockerfile)

Read [](file:///home/jakubs/repositories/ralph-orchestrator/profiles/ralph-docs/docker-compose.yml)

Read [](file:///home/jakubs/repositories/ralph-orchestrator/profiles/ralph-vscode/Dockerfile)

Read [](file:///home/jakubs/repositories/ralph-orchestrator/profiles/ralph-vscode/docker-compose.yml)

Read [](file:///home/jakubs/repositories/ralph-orchestrator/src/container/compose-client.ts#1-1), lines 1 to 100

Read [](file:///home/jakubs/repositories/ralph-orchestrator/src/container/copilot-executor.ts)

Read [](file:///home/jakubs/repositories/ralph-orchestrator/src/container/claude-code-executor.ts)

Read [](file:///home/jakubs/repositories/ralph-orchestrator/src/jira/client.ts#1-1), lines 1 to 60

Read [](file:///home/jakubs/repositories/ralph-orchestrator/src/services/heartbeat.ts#1-1), lines 1 to 50

Searched for files matching `**/profiles/ralph-docs/resources/**`, 1 match

Searched for files matching `**/profiles/ralph-vscode/resources/**`, 1 match

Searched for text `https://` (`**/profiles/**/resources/**`), 6 results

Searched for regex `npx.*@` (`**/profiles/**`), no results

Searched for regex `npx.*@` (`**/profiles/ralph-docs/setup.sh`), no results

Searched for regex `registry.npmjs.org|rubygems.org|pypi.org|nuget.org|github.com`, 20 results

Read [](file:///home/jakubs/repositories/ralph-orchestrator/src/services/heartbeat.ts#50-50), lines 50 to 98

Searched for regex `dev.azure.com|kenticoxperience` (`**/profiles/**`), 20 results

Searched for regex `copilot-proxy|api\.anthropic\.com|api\.githubcopilot|copilot\.github|api\.github\.com`, no results

Searched for regex `playwright.*mcp|@playwright/mcp|@azure-devops/mcp`, 2 results

Searched for regex `mcr\.microsoft\.com`, 3 results

Searched for regex `rubygems|bundler|gem install|gem source` (`**/profiles/**`), 5 results

Searched for regex `git push|git clone|git remote|git pull` (`**/profiles/**`), 11 results

Searched for regex `playwright install|playwright\.dev`, 2 results

Searched for regex `rvm\.io|keyserver\.ubuntu`, 4 results

Read [](file:///home/jakubs/repositories/ralph-orchestrator/config.json)

Searched for regex `aka\.ms|download\.docker\.com|deb\.nodesource|dot\.net|cli\.github\.com`, 13 results

Now I have a complete picture. Let me create the security hardening plan: 

Using "Create File"

File creation is disabled. Let me output the full plan as a codeblock for you to save:

```markdown
# Security Hardening Plan — Ralph Agent Containers

> **Date:** 2026-02-17  
> **Scope:** Prevent a compromised/injected AI agent from causing damage **outside** its container.  
> **Threat model:** Prompt injection causes the agent to execute arbitrary commands. Everything inside the container (workspace, local files) is considered expendable and recoverable. External interactions (network exfiltration, lateral API access, host compromise) must be prevented.

---

## Current State — Security Audit

### Critical Findings

| # | Finding | Severity | Impact |
|---|---|---|---|
| 1 | **Docker socket mounted read-write** (`/var/run/docker.sock`) | **CRITICAL** | Full host compromise. Agent can spawn privileged containers, access host filesystem, exfiltrate all secrets from other containers. |
| 2 | **Docker socket is unused** — no agent workflow requires it | **CRITICAL** | Zero functional impact to remove it. Pure leftover from devcontainer migration. |
| 3 | **Unrestricted network egress** — agent can reach any internet host | **HIGH** | Data exfiltration to arbitrary endpoints, C2 communication, abuse of API tokens against unintended targets. |
| 4 | **All API secrets exposed as env vars** — GH_TOKEN, ADO PATs, JIRA PAT, ANTHROPIC_API_KEY, MSSQL_SA_PASSWORD | **HIGH** | Agent can read all secrets via `env`/`printenv`. If network egress is unrestricted, secrets can be exfiltrated. |
| 5 | **No resource limits** — no memory, CPU, or PID caps | **MEDIUM** | Runaway agent can DoS the host (fork bomb, memory exhaustion). |
| 6 | **No capability dropping** — default Docker capabilities retained | **MEDIUM** | `CAP_NET_RAW` enables raw packet crafting, `CAP_SYS_CHROOT` enables chroot escapes. |
| 7 | **No read-only root filesystem** | **MEDIUM** | Agent can modify system binaries, install backdoors in container. |
| 8 | **vscode user has passwordless sudo** (devcontainers base image) | **MEDIUM** | Trivial root escalation inside container. |
| 9 | **vscode user in docker group** | **MEDIUM** | Compounds the Docker socket issue. |
| 10 | **SQL Server port published to host** (`1455:1433`) | **LOW** | Accessible from localhost. Default SA password (`Password123!`). |
| 11 | **No image digest pinning** | **LOW** | Supply-chain risk on base image. |

### What's Already Right

- Agent definition files mounted `:ro`
- Hook scripts and audit config mounted `:ro`
- Resource files mounted `:ro`
- Containers torn down after each task (no persistent state between runs)
- Timeout enforcement on agent execution
- Crash recovery marks orphaned operations as errored

---

## Hardening Plan

### Phase 1: Eliminate Container Escape (CRITICAL)

**Effort:** 15 minutes | **Impact:** Removes the single most dangerous vector

#### 1.1 Remove Docker socket mount

Both profiles mount `/var/run/docker.sock` — this is unused by any agent workflow (verified: no Docker commands in agent files, setup scripts, or shared includes). It's a leftover from devcontainer migration.

**Changes:**

`profiles/ralph-docs/docker-compose.yml`:
- Remove `- /var/run/docker.sock:/var/run/docker.sock`

`profiles/ralph-vscode/docker-compose.yml`:
- Remove `- /var/run/docker.sock:/var/run/docker.sock`

#### 1.2 Remove Docker CLI from container images

With the socket removed, the Docker CLI is dead weight and attack surface.

`profiles/ralph-docs/Dockerfile`:
- Remove Section 8 ("Docker CLI + Compose plugin") entirely — the `apt-get install docker-ce-cli docker-compose-plugin` block and the `curl | gpg` key import
- Remove `groupadd -f docker && usermod -aG docker vscode`

`profiles/ralph-vscode/Dockerfile`:
- Remove Section 5 (same Docker CLI block)
- Remove `groupadd -f docker && usermod -aG docker vscode`

#### 1.3 Disable sudo for vscode user

The devcontainers base image configures passwordless sudo. While root-inside-container is less dangerous without the Docker socket, it still allows modifying iptables rules set up in Phase 2.

Both Dockerfiles — add near the end (before `USER vscode`):
```dockerfile
RUN rm -f /etc/sudoers.d/vscode 2>/dev/null; \
    sed -i '/vscode/d' /etc/sudoers
```

**Verification:** After rebuild, `sudo ls` inside the container should fail.

---

### Phase 2: DNS/Network Allowlist (HIGH)

**Effort:** 1–2 hours | **Impact:** Prevents data exfiltration and unauthorized API access

The agent needs access to specific external services. Everything else should be blocked.

#### 2.1 DNS sinkholing via CoreDNS sidecar

Add a CoreDNS sidecar container that only resolves allowlisted domains. All DNS queries from the agent container go through this resolver. Unknown domains resolve to `0.0.0.0`.

**Allowlisted domains (agent execution):**

| Domain | Purpose |
|---|---|
| `api.githubcopilot.com` | Copilot CLI LLM backend |
| `copilot-proxy.githubusercontent.com` | Copilot CLI proxy |
| `api.github.com` | GitHub API (auth validation) |
| `github.com` | Git operations, Copilot CLI updates |
| `api.anthropic.com` | Claude Code backend |
| `api.atlassian.com` | JIRA REST API |
| `*.atlassian.net` | JIRA attachment downloads |
| `dev.azure.com` | ADO git + REST API |
| `registry.npmjs.org` | npm packages (build, MCP servers) |
| `rubygems.org` | Ruby gems (ralph-docs only) |
| `api.nuget.org` | NuGet restore (ralph-docs only) |

**Add to `docker-compose.yml`:**

```yaml
services:
  dns:
    image: coredns/coredns:1.12
    volumes:
      - ./security/Corefile:/etc/coredns/Corefile:ro
      - ./security/allowlist.hosts:/etc/coredns/allowlist.hosts:ro
    networks:
      - devcontainer-ralph-network
    command: ["-conf", "/etc/coredns/Corefile"]

  app:
    dns:
      - <dns-container-ip>
    depends_on:
      - dns
```

**`security/Corefile`:**
```
. {
    hosts /etc/coredns/allowlist.hosts {
        fallthrough
    }
    template IN A {
        answer "{{ .Name }} 60 IN A 0.0.0.0"
    }
    template IN AAAA {
        answer "{{ .Name }} 60 IN AAAA ::1"
    }
    log
    errors
}
```

The `hosts` plugin resolves allowlisted domains normally (via `fallthrough` to upstream). The `template` plugin sinkhole-responds for everything else.

#### 2.2 Iptables egress firewall (defense-in-depth)

Even with DNS sinkholing, the agent could use hardcoded IPs to bypass DNS. Add iptables rules to restrict egress.

**Simplified approach — block non-HTTPS egress:**

Create `security/firewall.sh`:
```bash
#!/bin/bash
# Allow established connections and loopback
iptables -A OUTPUT -m state --state ESTABLISHED,RELATED -j ACCEPT
iptables -A OUTPUT -o lo -j ACCEPT

# Allow DNS to CoreDNS sidecar
iptables -A OUTPUT -p udp --dport 53 -j ACCEPT
iptables -A OUTPUT -p tcp --dport 53 -j ACCEPT

# Allow HTTPS (all allowlisted services use 443)
iptables -A OUTPUT -p tcp --dport 443 -j ACCEPT

# Allow internal DB connection
iptables -A OUTPUT -p tcp --dport 1433 -d 172.16.0.0/12 -j ACCEPT

# Drop everything else
iptables -A OUTPUT -j DROP
```

This blocks: SSH (22), HTTP (80), SMTP (25/587), arbitrary TCP/UDP, raw sockets. The agent can only speak HTTPS and reach the internal DB.

#### 2.3 Orchestrator-managed firewall setup

Have the orchestrator run the firewall script as root via `docker compose exec --user root` after container start but before the agent executes — the same pattern used by `cleanLogs()`. This avoids needing `CAP_NET_ADMIN` during agent execution.

Add to `ContainerManager.start()`:
```typescript
private async setupFirewall(): Promise<void> {
  await this.compose.exec(["-T", "--user", "root", "app", "bash", "/security/firewall.sh"]);
}
```

Mount the script read-only:
```yaml
- ./security/firewall.sh:/security/firewall.sh:ro
```

---

### Phase 3: Secret Scoping (HIGH)

**Effort:** 30 minutes | **Impact:** Reduces blast radius of secret exfiltration

#### 3.1 CLI-specific secret injection

Scope secrets per CLI:

- `cli: "copilot"` → inject `GH_TOKEN`, **omit** `ANTHROPIC_API_KEY`
- `cli: "claude"` → inject `ANTHROPIC_API_KEY`, **omit** `GH_TOKEN`

Implement in `ComposeClient.buildEnv()` by accepting a `cli` parameter and conditionally including keys.

#### 3.2 Remove MSSQL_SA_PASSWORD from agent environment

The `app` service doesn't need the SA password — only the `db` service does. Remove `MSSQL_SA_PASSWORD` from the `app` environment block. If the agent needs DB access, the target repo's own config (mounted at `/workspace`) provides its own connection strings.

#### 3.3 Remove SQL Server host port

Change `ports: "1455:1433"` to `expose: ["1433"]` — the DB is only needed internally by the app container, not from the host.

---

### Phase 4: Resource Limits (MEDIUM)

**Effort:** 10 minutes | **Impact:** Prevents DoS of the host

Add to both compose files under `services.app`:

```yaml
deploy:
  resources:
    limits:
      memory: 8G
      cpus: "4.0"
    reservations:
      memory: 2G
      cpus: "1.0"
pids_limit: 500
ulimits:
  nofile:
    soft: 65536
    hard: 65536
  nproc:
    soft: 4096
    hard: 8192
```

Values chosen for:
- **8 GB memory** — Ruby/Jekyll builds peak at ~3 GB, plus Node.js/dotnet headroom
- **4 CPUs** — sufficient for parallel builds
- **500 PIDs** — prevents fork bombs while allowing Node.js worker threads + build subprocesses

---

### Phase 5: Container Hardening (MEDIUM)

**Effort:** 15 minutes | **Impact:** Defense-in-depth, reduces attack surface

#### 5.1 Drop all capabilities

```yaml
cap_drop:
  - ALL
```

No additional capabilities are needed for agent execution (git, curl, npm, build tools all work without special caps).

#### 5.2 Prevent privilege escalation

```yaml
security_opt:
  - "no-new-privileges:true"
```

Prevents `setuid` binaries and `sudo` from granting privileges, even if the sudoers file isn't removed.

#### 5.3 Read-only root filesystem

```yaml
read_only: true
tmpfs:
  - /tmp:size=2G
  - /home/vscode:size=1G
  - /var/tmp:size=512M
  - /run:size=64M
```

The root filesystem becomes immutable. Writable areas: `/workspace` (bind mount), tmp, `/home/vscode` (tmpfs).

**Caveat:** Some tools write to lib, share, etc. Test thoroughly. May need additional tmpfs mounts for tool caches (e.g., `/home/vscode/.npm`, `/home/vscode/.bundle`).

#### 5.4 Default seccomp profile

Ensure the default Docker seccomp profile is active (it blocks ~44 dangerous syscalls). Verify no `seccomp=unconfined` is present.

---

### Phase 6: Audit & Monitoring (LOW)

**Effort:** 1 hour | **Impact:** Detection of anomalous behavior

#### 6.1 DNS query logging

The CoreDNS sidecar (Phase 2.1) logs all DNS queries. Collect these after each task — queries to sinkholed domains are strong injection indicators.

#### 6.2 Outbound connection auditing

Before teardown, capture active connections:
```typescript
await this.compose.exec(["-T", "app", "ss", "-tunp"]);
```

Connections to unexpected IPs/ports signal compromise.

#### 6.3 File integrity monitoring

After agent completion, check for modified system files:
```typescript
await this.compose.exec(["-T", "app", "find", "/usr", "/etc", "-newer", "/tmp/.ralph-start", "-type", "f"]);
```

#### 6.4 Process tree capture

Before teardown, check for unexpected background processes:
```typescript
await this.compose.exec(["-T", "app", "ps", "auxf"]);
```

---

## Implementation Priority

| Phase | Effort | Impact | Priority |
|---|---|---|---|
| **1. Remove Docker socket** | 15 min | Eliminates host compromise | **DO FIRST** |
| **4. Resource limits** | 10 min | Prevents DoS | Quick win (same edit) |
| **5. Container hardening** | 15 min | Defense-in-depth | Quick win (same edit) |
| **3. Secret scoping** | 30 min | Reduces blast radius | **DO SECOND** |
| **2. DNS/Network allowlist** | 1–2 hours | Prevents exfiltration | **DO THIRD** |
| **6. Audit & monitoring** | 1 hour | Detection capability | Follow-up |

**Phase 1 alone eliminates 90% of the risk.** The Docker socket gives any code in the container full root access to the host — removing it is a one-line change with zero functional impact.

---

## Network Architecture — Target State

```
┌──────────────────────────────────────────────────────────────┐
│ Host                                                          │
│                                                               │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ Docker Network (ralph-sandbox)                          │  │
│  │                                                         │  │
│  │  ┌──────────┐    DNS     ┌───────────────────────┐     │  │
│  │  │ CoreDNS  │◄──────────│  App (agent)            │     │  │
│  │  │ sidecar  │            │                         │     │  │
│  │  │          │            │ cap_drop: ALL            │     │  │
│  │  │ Allowlist│            │ no-new-privileges: true  │     │  │
│  │  │ only     │            │ read_only: true          │     │  │
│  │  └──────────┘            │ pids_limit: 500          │     │  │
│  │                          │ memory: 8G               │     │  │
│  │                          │ NO docker socket         │     │  │
│  │                          │ NO sudo                  │     │  │
│  │                          └──────────┬──────────────┘     │  │
│  │                                     │ iptables:          │  │
│  │                                     │  443 → ALLOW       │  │
│  │                                     │  53  → CoreDNS     │  │
│  │                                     │  *   → DROP        │  │
│  │                          ┌──────────┴──────────────┐     │  │
│  │                          │ SQL Server (internal)    │     │  │
│  │                          │ No host port exposed     │     │  │
│  │                          └─────────────────────────┘     │  │
│  └────────────────────────────────────────────────────────┘  │
│                                     │                         │
│                                     │ HTTPS (443) only        │
│                                     ▼                         │
│  ┌──────────────────────────────────────────────────────┐    │
│  │ Allowlisted endpoints only:                           │    │
│  │  api.githubcopilot.com    api.anthropic.com           │    │
│  │  api.github.com           api.atlassian.com           │    │
│  │  dev.azure.com            registry.npmjs.org          │    │
│  │  rubygems.org             api.nuget.org               │    │
│  └──────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────┘
```

---

## Risk Residuals (After All Phases)

| Risk | Mitigation | Residual |
|---|---|---|
| Agent abuses **allowlisted** APIs (pushes malicious code to ADO, posts garbage JIRA comments) | Fine-grained PAT scopes, PR review process, JIRA permissions | **Accepted** — mitigated by human review |
| npm/gem supply chain attacks during `npm ci` / `bundle install` | Lockfiles pin exact versions | **Low** |
| Agent exfiltrates workspace content to allowlisted API (encodes secrets in JIRA comment body) | JIRA comment length limits, audit trail on all writes | **Accepted** — detectable, workspace is ephemeral |
| DNS rebinding (allowlisted domain resolves to internal IP) | CoreDNS can block private IP responses for public domains | **Low** |
| Agent reads env vars and encodes tokens in git commit messages pushed to ADO | PR review, git hook pre-push verification | **Low** — detectable |
```

Save this as `SECURITY-HARDENING.md` in the workspace root. It's 350 lines covering the full audit (11 findings), 6 implementation phases (prioritized by impact/effort), the target network architecture diagram, and residual risk analysis.  Save this as `SECURITY-HARDENING.md` in the workspace root. It's 350 lines covering the full audit (11 findings), 6 implementation phases (prioritized by impact/effort), the target network architecture diagram, and residual risk analysis.  

Asked a question (Next)