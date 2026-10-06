# Agent Git & Egress Security Architecture

## Design Philosophy

The agent operates in a sandboxed environment with full local freedom but zero direct external access. All outbound communication is mediated through purpose-built MCP tools. The agent controls the **content** of its work but never the **destination**.

Prompt-level guardrails (like those baked into CLI wrappers/copilots) are seatbelts — they instruct the model to behave. Infrastructure-level sandboxing is the walls of the track — it physically prevents certain actions regardless of what the model decides. You want both, but the infrastructure layer is the one that matters. Models are relentlessly goal-oriented and will creatively work around prompt-level constraints (encode data in DNS queries, abuse package manager post-install scripts, base64 into GET parameters, etc.) if the infrastructure allows it.

---

## 1. Container Topology

```
┌──────────────────┐       ┌──────────────────┐
│     Agent         │       │   MCP Server      │
│                   │       │                   │
│  - No credentials │       │  - Has PATs       │
│  - No network     │       │  - Has network    │
│  - Full local git │       │  - Stateless      │
│  - CLI wrapper    │       │  - Credential     │
│    with built-in  │       │    helpers         │
│    guardrails     │       │                   │
└────────┬──────────┘       └────────┬──────────┘
         │                           │
         └───────────┬───────────────┘
                     │
              ┌──────┴──────┐
              │  /workspace  │
              │  (shared vol)│
              └─────────────┘
```

Both containers mount the same workspace volume. The agent reads and writes to the repo (commits, branches, etc.). The MCP server reads from the same repo and executes authenticated git operations against the remote. They share state through the filesystem — git on disk is the state.

**Critical:** The credential helper / PAT must only be accessible inside the MCP server container. It must NOT be mounted into the agent's container. Even without network access, the agent could read credentials off disk if they're available.

---

## 2. Network Security

### Egress Policy

All outbound network traffic is blocked by default via a forward proxy (Squid or equivalent). Only explicitly whitelisted destinations are reachable from the agent's environment.

**Whitelisted endpoints:**

| Destination | Purpose |
|---|---|
| `api.anthropic.com` | LLM API access |
| MCP server (localhost or internal URL) | All external side effects |
| Package registries (npm, pip, etc.) | Dependency installation if needed |

**Blocked:**

- All other HTTP/HTTPS
- All SSH
- All other protocols

The MCP server is the **sole gateway** to external services. It holds all credentials. The agent never sees tokens, PATs, or API keys.

**Important:** Once MCP tools handle all push/PR operations, remove GitHub (and any other external service) from the Squid allowlist entirely. The MCP server talks to GitHub from its own network context, not through the agent's proxy.

### Why This Matters

Even if the agent hallucinates a new workflow, gets prompt-injected (e.g., from a comment in a file it reads), or tries to `curl` an external service directly, it physically cannot reach anything outside the whitelist. The proxy is the hard security boundary; everything else is defense in depth.

---

## 3. Workspace Setup

### Ephemeral Docker Environment with Cached Git Objects

Each task gets a fresh, disposable container with an ephemeral volume. Nothing persists between tasks. To avoid the overhead of re-cloning, use a shared git object cache.

```bash
# Shared persistent volume (updated periodically by orchestrator)
# This is a bare mirror of the repo, used as an object cache
/cache/repos/my-repo.git

# Per-task ephemeral volume
git clone --reference /cache/repos/my-repo.git <WORK_REPO> /workspace/repo
```

`--reference` tells git to reuse objects from the cached bare repo instead of downloading them. The clone is near-instant but the workspace is fully ephemeral. Clean state guarantee without the clone overhead.

**Why ephemeral over persistent:**

- Clean state every time, no accumulated garbage
- No risk of cross-task contamination (dirty state from previous tasks confusing the agent)
- No cleanup logic needed between tasks (`git clean -fdx`, `git reset --hard`, etc. — logic that will eventually have bugs)
- Simple mental model — each task is fully independent

**The trade-off:** If the agent gets interrupted mid-task, work is lost unless it called `push_progress()`. This is acceptable — it mirrors how a developer would lose uncommitted work.

**Dependency caching:** Same pattern — mount a shared cache volume read-only for npm/pip caches, but keep actual `node_modules` / `venv` on the ephemeral volume.

**Full orchestrator setup flow:**

```bash
# 1. Create ephemeral workspace
docker run --rm -v workspace:/workspace -v git-cache:/cache:ro agent-image

# 2. Clone the working repo (orchestrator has the PAT, agent does not)
git clone --reference /cache/repos/my-repo.git \
  --depth 100 --no-tags --single-branch --branch main \
  <WORK_REPO> /workspace/repo

# 3. Add the read-only reference remote for diffs
cd /workspace/repo
git remote add reference <REFERENCE_REPO>
git fetch reference

# 4. Strip all credentials from the environment
#    No PATs, no SSH keys, no credential helpers left behind

# 5. Start the agent in /workspace/repo
```

**Key decision: `--depth 100` not `--depth 1`.** Shallow clone with depth 1 breaks `git log`, `git blame`, `git diff branch..branch`, and rebasing. 100 commits covers most workflows while keeping the clone fast.

### Dual Remote Configuration

The workspace has two remotes:

| Remote | Purpose | Agent Access |
|---|---|---|
| `origin` | Working repo — where changes are pushed | Push via MCP tool only |
| `reference` | Source of truth for diffs and comparisons | Read-only, local refs only |

After the orchestrator fetches both remotes, all data is local. The agent uses standard git ref prefixes (`origin/`, `reference/`) to differentiate:

```bash
# Compare branches across remotes
git diff reference/main..origin/main

# View history on the reference repo
git log reference/main --oneline

# Local work happens on origin
git checkout -b my-feature origin/main
```

---

## 4. MCP Tools

All external side effects go through MCP tools. The agent has **no parameters to control destinations** — the orchestrator bakes the target into the task context at startup.

### Architecture: Stateless, Shared Volume

The MCP server is **stateless per tool call**. No in-memory state, no session tracking, no database. Git on disk is the state. Each tool call reads from the shared workspace, executes an authenticated operation, and returns.

The MCP server is rooted at the repo root on the shared volume and runs all git commands from there:

```javascript
const REPO_ROOT = '/workspace/repo'  // shared volume mount
const TASK_BRANCH = process.env.TASK_BRANCH  // set by orchestrator
```

### Task Context

Set once by the orchestrator as environment variables before the MCP server starts. All tools reference this context. The agent cannot override it.

```javascript
// Environment variables set by orchestrator
const taskContext = {
  TASK_BRANCH: process.env.TASK_BRANCH,       // "agent/task-1234"
  JIRA_ISSUE: process.env.JIRA_ISSUE,         // "PROJ-1234"
  SLACK_CHANNEL: process.env.SLACK_CHANNEL,    // "#agent-updates"
  REPO_ROOT: process.env.REPO_ROOT,            // "/workspace/repo"
}
```

### Tool Definitions

#### `sync_remote()`

Fetches latest changes from both remotes. Does not modify the agent's working tree or current branch.

```javascript
// No parameters. Agent cannot control what is fetched or from where.

function handleSyncRemote() {
  const cwd = REPO_ROOT
  const gitEnv = {
    ...process.env,
    GIT_ASKPASS: '/path/to/credential-helper',
    GIT_TERMINAL_PROMPT: '0'
  }

  // Fetch both remotes
  execSync(`git fetch origin`, { cwd, env: gitEnv, timeout: 60000 })
  execSync(`git fetch reference`, { cwd, env: gitEnv, timeout: 60000 })

  // Return context so the agent knows where it stands
  const status = execSync(
    `git rev-list --left-right --count HEAD...origin/main`,
    { cwd }
  ).toString().trim()

  const [behind, ahead] = status.split('\t')

  return {
    synced: true,
    current_branch: execSync('git rev-parse --abbrev-ref HEAD', { cwd }).toString().trim(),
    commits_ahead_of_main: parseInt(ahead),
    commits_behind_main: parseInt(behind),
    hint: behind > 0
      ? "You're behind origin/main. Consider rebasing with: git rebase origin/main"
      : "You're up to date with origin/main"
  }
}
```

#### `push_progress()`

Saves the agent's current work-in-progress to the remote. Always pushes to the assigned task branch regardless of local branch name.

```javascript
// No parameters. Branch is determined by task context.

function handlePushProgress() {
  execSync(
    `git push origin HEAD:refs/heads/${TASK_BRANCH}`,
    {
      cwd: REPO_ROOT,
      env: {
        ...process.env,
        GIT_ASKPASS: '/path/to/credential-helper',
        GIT_TERMINAL_PROMPT: '0'
      },
      timeout: 60000
    }
  )

  return {
    pushed: true,
    branch: TASK_BRANCH,
    commit: execSync('git rev-parse HEAD', { cwd: REPO_ROOT }).toString().trim()
  }
}
```

**How `HEAD:refs/heads/<branch>` works:** This git refspec takes whatever commit HEAD currently points to locally and places it on the remote as the specified branch. The agent's local branch name is irrelevant — it could be `main`, `foo-bar`, or a detached HEAD. The remote branch is always the one assigned by the task context.

#### `create_pr(title, description)`

Pushes current HEAD to the task branch and opens a pull request.

```javascript
// Agent controls content (title, description) but not destination.

function handleCreatePR(title, description) {
  // Push current work
  execSync(
    `git push origin HEAD:refs/heads/${TASK_BRANCH}`,
    {
      cwd: REPO_ROOT,
      env: {
        ...process.env,
        GIT_ASKPASS: '/path/to/credential-helper',
        GIT_TERMINAL_PROMPT: '0'
      },
      timeout: 60000
    }
  )

  // Create PR via GitHub API
  const pr = await ghAPI.createPullRequest({
    owner: REPO_OWNER,
    repo: REPO_NAME,
    head: TASK_BRANCH,
    base: 'main',
    title: title,
    body: description
  })

  return {
    created: true,
    pr_number: pr.number,
    pr_url: pr.html_url,
    branch: TASK_BRANCH
  }
}
```

#### `add_comment(text)`

Adds a comment to the assigned Jira issue (or any other issue tracker).

```javascript
// Agent controls the text. Issue is fixed by task context.

function handleAddComment(text) {
  await jiraAPI.addComment(JIRA_ISSUE, { body: text })

  return { commented: true, issue: JIRA_ISSUE }
}
```

#### General Pattern for Additional Tools

Any external side effect follows the same pattern:

- Agent controls **content** only (text, title, description, message body)
- **Destination** is hardcoded from task context (which branch, which issue, which channel)
- **Credentials** live on the MCP server, never in the agent's environment
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

**Cannot do (no credentials, no network):**

- `git push` — blocked by proxy, no credentials
- `git fetch` / `git pull` — blocked by proxy, use `sync_remote()` tool
- `git clone` — blocked by proxy

The agent's local repo is its scratchpad. It can create branches, rewrite history, rebase, whatever it needs. The only way work leaves the sandbox is through MCP tools.

---

## 6. Agent System Prompt

Include the following in the agent's instructions:

```
## Git Setup

You're working in a repository with two remotes:

- `origin` — your working repo. This is where your changes go.
- `reference` — read-only source of truth for diffs and comparisons.

When comparing changes or reviewing diffs, use `reference/` prefixed branches:
  git diff reference/main..origin/main
  git log reference/main --oneline

When committing your work, commit locally as normal.
When you're ready to submit, use the `create_pr()` tool.

You cannot push directly. Do not attempt to.

## Available Tools

- `sync_remote()` — fetches latest from both remotes. Returns ahead/behind count.
- `create_pr(title, description)` — pushes your work and opens a PR.
- `push_progress()` — saves your current work-in-progress to remote.
- `add_comment(text)` — adds a comment to the assigned issue.

## Constraints

- No direct network access. All external actions go through tools.
- You have read-only local access to both repos.
- Do not modify .git/config or remotes.
```

---

## 7. Security Summary

| Layer | What It Prevents |
|---|---|
| **Squid proxy (egress block)** | Agent reaching any external service directly |
| **No credentials in agent container** | Agent authenticating with any remote service |
| **Credential helper isolated to MCP container** | Agent reading credentials off disk |
| **MCP tool destination scoping** | Agent pushing to wrong branches, commenting on wrong issues |
| **Stateless MCP tools** | State leakage or confusion between tool calls |
| **Ephemeral containers** | State leaking between tasks, credential accumulation |
| **Git refspec control (`HEAD:refs/heads/<branch>`)** | Agent controlling where code is pushed on the remote |
| **Pre-cloned workspace with `--reference` cache** | Agent needing clone credentials; fast startup without persistence |
| **CLI wrapper guardrails (prompt-level)** | Defense in depth — reduces likelihood of agent going off-script, but not relied upon as the security boundary |

The fundamental principle: **local freedom, controlled egress**. The agent can do whatever it needs inside its sandbox. Every action that crosses the sandbox boundary goes through a stateless tool where you control the destination.

---

## 8. Handling Large Diffs

When diffs between branches are very large (hundreds of files, 1MB+), avoid dumping raw output into the agent's context. The agent should use git's built-in filtering:

```bash
# Start broad
git diff --stat reference/main..origin/main

# Narrow to a directory
git diff --stat reference/main..origin/main -- src/api/

# View a specific file
git diff reference/main..origin/main -- src/api/users.ts

# Filter by change type
git diff --diff-filter=M reference/main..origin/main   # modified only
git diff --diff-filter=A reference/main..origin/main   # added only
```

Since the agent has unrestricted local git access, it can compose whatever commands it needs. No custom tools are required for diff exploration — git's native capabilities are sufficient. The agent naturally uses `--stat` first, then drills into specific files, mirroring how a human developer works.

If the agent's output from a git command is still too large, it can further scope with path filters, `--no-ext-diff`, `-U0` (no context lines), or piping through `head` locally.