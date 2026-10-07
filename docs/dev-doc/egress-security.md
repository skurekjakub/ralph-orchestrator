# Agent Git & Egress Security Architecture

## Design Philosophy

The agent operates in a sandboxed environment with full local freedom but tightly limited external access. Its outbound side effects (pushes, pull requests, JIRA comments) are mediated through purpose-built MCP tools. The agent controls the **content** of its work but never the **destination**.

Prompt-level guardrails (like those baked into CLI wrappers/copilots) are seatbelts — they instruct the model to behave. Infrastructure-level sandboxing is the walls of the track — it physically prevents certain actions regardless of what the model decides. You want both, but the infrastructure layer is the one that matters. Models are relentlessly goal-oriented and will creatively work around prompt-level constraints (encode data in DNS queries, abuse package manager post-install scripts, base64 into GET parameters, etc.) if the infrastructure allows it.

[SECURITY.md](../../SECURITY.md) is the reference for each control; this document explains how git and egress fit together.

---

## 1. Container Topology

```
┌──────────────────────┐   ┌──────────────────────┐   ┌──────────────────┐
│  Agent (app)         │   │  MCP sidecar         │   │  Squid           │
│                      │   │                      │   │  (egress-proxy)  │
│  - Its CLI's         │   │  - MCP credentials   │   │                  │
│    credential only   │   │    (gateway.json)    │   │  - Task domain   │
│  - Network: Squid    │   │  - Direct internet   │   │    allowlist     │
│    and the sidecar   │   │  - Tool-filter proxy │   │                  │
│  - Full local git    │   │    per server        │   │                  │
└──────────┬───────────┘   └──────────┬───────────┘   └──────────────────┘
           │                          │
           └────────────┬─────────────┘
                        │
              ┌─────────┴──────────┐
              │  /workspace        │
              │  (task workspace,  │
              │   bind mount)      │
              └────────────────────┘
```

Both containers mount the task's workspace (`cache/workspaces/<taskId>` on the host) at `/workspace`. The agent reads and writes the repo and commits locally. The sidecar's `ado` MCP server reads the same repo and runs the authenticated git operations against the remote. They share state through the filesystem — git on disk is the state.

**Critical:** the target repo's credential (`ADO_PAT` for the bundled profiles) lives only in the orchestrator's environment, which clones and fetches on the host with the profile's `repoPat`, and in the sidecar's `gateway.json`, from which the `ado` server pushes. Both pass it per command as an `http.extraHeader`, so no clone's git config stores it, and the agent container never gets it. The agent container holds the credential of each CLI its container stages run (`CLAUDE_CODE_OAUTH_TOKEN` or `ANTHROPIC_API_KEY`, `GH_TOKEN` for Copilot CLI), which a prompt-injected agent can read ([SECURITY.md](../../SECURITY.md#credentials-in-the-agent-container)).

---

## 2. Network Security

### Egress Policy

The agent container sits on the internal-only `ralph-internal` network. Its HTTP and HTTPS traffic goes through Squid, which allows only the task's allowlist (`profiles/<id>/.build/squid.conf`, regenerated before every task):

| Destination                                                  | Purpose                                                                     | Allowed when                                   |
| ------------------------------------------------------------ | --------------------------------------------------------------------------- | ---------------------------------------------- |
| `api.anthropic.com`                                          | Claude Code's model API, and `WebFetch`'s domain safety check               | A container stage of the task runs Claude Code |
| `.githubcopilot.com`, `api.github.com`, `github.com`         | Copilot CLI's model API                                                     | A container stage of the task runs Copilot CLI |
| The profile's `allowlistDomains`                             | Package registries and feeds the profile's setup and builds need            | Always, for that profile                       |
| `host.docker.internal` on the ports `squid.conf` lists       | Host services such as the Ralphchives RAG endpoint                          | Always                                         |
| `mcp-sidecar` on each server's `sidecarPort` (not via Squid) | All other external side effects: JIRA, ADO REST, documentation, web fetches | The variant declares MCP servers               |

**Blocked:**

- All other HTTP/HTTPS domains
- Ports other than 80 and 443, and `CONNECT` to ports other than 443
- Everything that is not HTTP: the internal network has no route out

Claude Code's `WebSearch` runs server-side at Anthropic, so this allowlist does not apply to it; `WebFetch` fetches through Squid and reaches only allowlisted domains. Host-side (`mode: "local"`) stages are not behind Squid; Claude Code runs them without web tools ([SECURITY.md](../../SECURITY.md#local-mode-stages)).

The MCP sidecar is the gateway to external services. It holds their credentials and reaches the internet directly over `ralph-sidecar-external`, not through Squid. A domain on the agent's own allowlist is reachable with whatever credential the agent holds, so a profile should list only what its builds need.

### Why This Matters

Even if the agent hallucinates a new workflow, gets prompt-injected (e.g., from a comment in a file it reads), or tries to `curl` an external service directly, it physically cannot reach anything outside the allowlist. The proxy is the hard security boundary; everything else is defense in depth.

---

## 3. Workspace Setup

### A Workspace per Task, Cloned on the Host

`TaskWorkspaceManager` (`src/services/task-workspace-manager.ts`) gives every task its own checkout, made on the host before compose up:

1. The orchestrator keeps one bare clone per profile in `cache/repos/<profileId>`: cloned from `repoUrl` on the profile's first task, fetched (every branch, `--prune`) before each later one. Git authenticates with the profile's `repoPat` through a per-command `-c http.extraHeader`.
2. The workspace, `cache/workspaces/<taskId>`, is a `git clone --local --branch <base>` of the bare clone: hard-linked objects, full history, no network. Its `origin` is then pointed at `repoUrl`, which carries no credentials.
3. The task branch is checked out from the remote when it exists there (a revision requires it), and otherwise created from the base branch.
4. `.ralph/` and the container CLIs' mount targets outside it go into `.git/info/exclude`, so Ralph's files never reach a commit.

```bash
# What the orchestrator runs on the host, in effect
git -c http.extraHeader="Authorization: Basic …" -C cache/repos/<profileId> fetch --prune origin "+refs/heads/*:refs/heads/*"
git clone --local --branch <base> cache/repos/<profileId> cache/workspaces/<taskId>
git -C cache/workspaces/<taskId> remote set-url origin <repoUrl>
```

**Why a workspace per task:**

- Clean state every time, no accumulated garbage
- No risk of cross-task contamination (dirty state from previous tasks confusing the agent)
- No cleanup logic between tasks (`git clean -fdx`, `git reset --hard`, etc. — logic that will eventually have bugs)
- Simple mental model — each task is fully independent

The workspace is deleted after a successful task (completed or partial) and kept, with its path logged, after any other outcome, so a failed run can be inspected. Work the agent never pushed with `ado_push_progress` or `ado_create_pull_request` stays only in that workspace.

### Remotes

The workspace has one remote, `origin`, the profile's `repoUrl`. Its remote-tracking refs (`origin/<branch>`) are the remote as the bare clone's fetch saw it when the task started. The agent cannot fetch or push itself; the sidecar's `ado` tools push for it.

```bash
# Compare the task branch with its base
git diff --stat origin/main...HEAD

# History of the base branch as of the task's start
git log origin/main --oneline
```

---

## 4. MCP Tools

All external side effects go through MCP tools in the sidecar. Where a tool has a destination, the orchestrator fixes it from the task context; the agent supplies only content.

### Task Context

Each server's environment comes from the profile's `mcpServers[].env`, whose runtime macros (`$task.id`, `$task.branch`, `$trigger.<key>`, `$variantEnv.<PREFIX>`) `writeJitMcpConfig` resolves per task into `gateway.json` ([runtime macros](../user-guide/runtime-macros.md)). The overlay adds `REPO_ROOT=/workspace`. The agent cannot change any of it: `gateway.json` is mounted only into the sidecar.

```json
{
  "name": "ado",
  "env": {
    "ADO_PROJECT": "CustomerEducation",
    "ADO_REPO": "kentico-docs-jekyll",
    "TASK_BRANCH": "$task.branch",
    "SOURCE_BRANCH": "$trigger.source_branch",
    "TARGET_BRANCH": "$trigger.target_branch"
  }
}
```

### Git and Pull Request Tools (`shared/mcp-servers/ado/`)

| Tool                                                                                                                | What the agent controls        | Fixed by the task context                                                                     |
| ------------------------------------------------------------------------------------------------------------------- | ------------------------------ | --------------------------------------------------------------------------------------------- |
| `ado_push_progress(message)`                                                                                        | The commit message             | Stages everything except `.ralph/`, commits, pushes `HEAD:refs/heads/$TASK_BRANCH`            |
| `ado_create_pull_request`                                                                                           | Title, description, draft flag | Source `refs/heads/$TASK_BRANCH`; target `$TARGET_BRANCH`, else `$SOURCE_BRANCH`, else `main` |
| `ado_list_pull_requests`, `ado_list_pull_request_threads`, `ado_create_pull_request_thread`, `ado_reply_to_comment` | Thread content                 | The project and repository (`ADO_PROJECT`, `ADO_REPO`)                                        |

Without `TASK_BRANCH`, `ado_create_pull_request` and `ado_list_pull_requests` take the source branch as a parameter; both bundled profiles set it. Every git command runs in `REPO_ROOT` and authenticates with `ADO_PAT` as a per-command `http.extraHeader` (`gitExec` in `shared/mcp-servers/ado/src/shared.ts`).

**How `HEAD:refs/heads/<branch>` works:** This git refspec takes whatever commit HEAD currently points to locally and places it on the remote as the specified branch. The agent's local branch name is irrelevant — it could be `main`, `foo-bar`, or a detached HEAD. The remote branch is always the one assigned by the task context. The push uses `--force-with-lease`.

### Issue Tools (`shared/mcp-servers/jira-kentico/`)

`jira_add_comment` and `jira_add_attachment` act on `JIRA_ISSUE_KEY`, which the bundled profiles set to `$task.id`. The agent controls the comment text and the file it attaches, which it writes to the shared `/tmp/mcp-attachments` directory.

### Tool Allowlists

Each server's manifest lists the tools an agent may use. The sidecar's tool-filter proxy hides every other tool and refuses calls to it, whatever the CLI asks for ([SECURITY.md](../../SECURITY.md#mcp-sidecar-tool-allowlists)).

### General Pattern for Additional Tools

Any external side effect follows the same pattern:

- Agent controls **content** only (text, title, description, message body)
- **Destination** is fixed from task context (which branch, which issue, which channel)
- **Credentials** live in the sidecar, never in the agent's environment
- **No parameters** for target/destination
- **Stateless** — each call reads from disk, acts, returns. No in-memory state between calls.

---

## 5. Local Git Access

The agent has full, unrestricted local git access. It does not need credentials for any local operation.

**Free to use without restriction:**

- `git diff`, `git log`, `git show`, `git blame`
- `git status`, `git branch`, `git tag`
- `git checkout`, `git switch`
- `git commit`, `git rebase`, `git merge`
- `git stash`, `git cherry-pick`
- Any other local operation

**Cannot do against the target repo (no credential in the container):**

- `git push` — use `ado_push_progress` or `ado_create_pull_request`
- `git fetch` / `git pull` — the remote-tracking refs stay as they were when the task started
- `git clone`

Where the repo's host is on the profile's allowlist, these requests reach it and fail authentication. The agent's local repo is its scratchpad. It can create branches, rewrite history, rebase, whatever it needs. The only way work leaves the sandbox is through MCP tools.

---

## 6. Agent Instructions

The agent templates carry the matching instructions. The `prompt-security` partial (`shared/agent-includes/prompt-security.md`) scopes the agent to its issue and branch, tells it to use only the network endpoints its workflow needs, and forbids adding, changing or removing git remotes. The root agents and their workflow skills name the `ado` and `jira-kentico` tools for pushing, opening the PR and reporting back.

---

## 7. Security Summary

| Layer                                                                  | What It Prevents                                                                                              |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| **Squid proxy (egress allowlist)**                                     | Agent reaching any domain outside the task's allowlist directly                                               |
| **No repo or MCP credentials in the agent container**                  | Agent authenticating to the target repo, JIRA or ADO REST; it holds only its CLI's credential                 |
| **Repo credential passed per command, on the host and in the sidecar** | Agent reading the repo credential off disk                                                                    |
| **MCP tool destination scoping**                                       | Agent pushing to wrong branches, commenting on wrong issues                                                   |
| **Sidecar tool-filter proxy**                                          | Agent calling MCP tools outside a server's allowlist                                                          |
| **Stateless MCP tools**                                                | State leakage or confusion between tool calls                                                                 |
| **Workspace per task**                                                 | State leaking between tasks                                                                                   |
| **Git refspec control (`HEAD:refs/heads/<branch>`)**                   | Agent controlling where code is pushed on the remote                                                          |
| **Host-side bare clone and `--local` workspace clone**                 | Agent needing clone credentials; fast workspace creation without network                                      |
| **Agent instructions (prompt-level)**                                  | Defense in depth — reduces likelihood of agent going off-script, but not relied upon as the security boundary |

The fundamental principle: **local freedom, controlled egress**. The agent can do whatever it needs inside its sandbox. Every action that crosses the sandbox boundary goes through a stateless tool where you control the destination, or through Squid to a domain you allowed.

---

## 8. Handling Large Diffs

When diffs between branches are very large (hundreds of files, 1MB+), avoid dumping raw output into the agent's context. The agent should use git's built-in filtering:

```bash
# Start broad
git diff --stat origin/main...HEAD

# Narrow to a directory
git diff --stat origin/main...HEAD -- src/api/

# View a specific file
git diff origin/main...HEAD -- src/api/users.ts

# Filter by change type
git diff --diff-filter=M origin/main...HEAD   # modified only
git diff --diff-filter=A origin/main...HEAD   # added only
```

Since the agent has unrestricted local git access, it can compose whatever commands it needs. No custom tools are required for diff exploration — git's native capabilities are sufficient. The agent naturally uses `--stat` first, then drills into specific files, mirroring how a human developer works.

If the agent's output from a git command is still too large, it can further scope with path filters, `--no-ext-diff`, `-U0` (no context lines), or piping through `head` locally.
