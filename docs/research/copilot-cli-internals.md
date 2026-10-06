# GitHub Copilot CLI Internals — Fleet Mode, Sub-Agents & SQL Tool

> Reverse-engineered from the bundled source at `~/.copilot/pkg/` (v0.0.411 linux-x64 + v0.0.420 universal).

---

## 1. Package Structure

```
~/.copilot/pkg/
├── linux-x64/0.0.411/
│   ├── index.js              # ~16 MB minified bundle (the entire app)
│   ├── npm-loader.js         # Entry point (bin: "copilot")
│   ├── package.json          # @github/copilot
│   ├── definitions/
│   │   ├── explore.agent.yaml
│   │   ├── task.agent.yaml
│   │   ├── code-review.agent.yaml
│   │   └── research.agent.yaml
│   ├── prebuilds/linux-x64/
│   │   ├── keytar.node       # Credential storage native addon
│   │   └── pty.node          # Pseudo-terminal native addon
│   ├── ripgrep/              # Bundled rg binary
│   ├── sharp/                # Image processing (WASM build)
│   ├── tree-sitter.wasm      # Parser runtime
│   ├── tree-sitter-bash.wasm
│   └── tree-sitter-powershell.wasm
└── universal/0.0.420/        # Platform-independent assets (same structure)
```

---

## 2. Fleet Mode (`/fleet`)

### What it is

Fleet mode is a **prompt injection pattern**, not a separate runtime mode. The `/fleet` slash command injects a system prompt that tells the main LLM to decompose work into parallel sub-agent dispatches.

### The command handler

```js
// Slash command registration
lVr = {
  name: "/fleet",
  args: "[prompt]",
  help: "Enable fleet mode for parallel subagent execution",
  execute: async (t, e) => {
    let n = e.join(" ").trim();
    // Simply sends the fleet prompt + optional user request into the conversation
    return await t.session.instance.fleet.start({ prompt: n || void 0 }),
      { kind: "noop" };
  }
};
```

### The fleet store (`svr`)

```js
function svr(t) {
  return {
    async start(e) {
      let n = e?.prompt
        ? `${FLEET_SYSTEM_PROMPT}\n\nUser request: ${e.prompt}`
        : FLEET_SYSTEM_PROMPT;
      return await t.send({
        prompt: n,
        displayPrompt: e?.prompt
          ? `Fleet deployed: ${e.prompt}`
          : "Fleet deployed"
      }), { started: true };
    }
  };
}
```

The fleet object is a reactive store on the session instance:

```js
// Session class (Zit)
class Session {
  model  = bvr(this);
  mode   = pvr(this);
  plan   = gvr(this);
  workspace = Nvr(this);
  fleet  = svr(this);    // ← fleet store
  // ...
}
```

### The fleet system prompt (verbatim)

```
You are now in fleet mode. Dispatch sub-agents (via the task tool) in parallel to do the work.

**Getting Started**
1. Check for existing todos: `SELECT id, title, status FROM todos WHERE status != 'done'`
2. If todos exist, dispatch them in parallel (respecting dependencies)
3. If no todos exist, help decompose the work into todos first

**Parallel Execution**
- Dispatch independent todos simultaneously
- Only serialize todos with true dependencies (check todo_deps)
- Query ready todos:
  `SELECT * FROM todos WHERE status = 'pending'
   AND id NOT IN (
     SELECT todo_id FROM todo_deps td
     JOIN todos t ON td.depends_on = t.id
     WHERE t.status != 'done'
   )`

**Sub-Agent Instructions**
When dispatching a sub-agent, include these instructions in your prompt:
1. Update the todo status when finished:
   - Success: `UPDATE todos SET status = 'done' WHERE id = '<todo-id>'`
   - Blocked: `UPDATE todos SET status = 'blocked' WHERE id = '<todo-id>'`
2. Always return a response summarizing:
   - What was completed
   - Whether the todo is fully done or needs more work
   - Any blockers or questions that need resolution

**Coordination**
- After sub-agents return, check todo status in SQL (source of truth)
- If status is still 'in_progress', the sub-agent may have failed to update - investigate
- Use the sub-agent's response to understand context, but trust SQL for status

Now proceed with the user's request using fleet mode.
```

### Feature flag

```js
// Fleet is generally available ("on"), not staff-only or experimental
FLEET_COMMAND: "on"
```

---

## 3. Sub-Agent Spawning — The Background Agent Registry

### How parallel execution works

When the LLM calls the `task` tool with `mode: "background"`, the **`VGe` class** (`backgroundAgentRegistry`) manages the lifecycle. There are **no OS threads, no `child_process.fork()`, no `worker_threads`** — it's all **concurrent async Promises on the same Node.js event loop**.

### The `VGe` class (backgroundAgentRegistry)

```js
class VGe {
  agents = new Map();
  pendingPromises = new Map();
  abortControllers = new Map();
  onChangeCallback;

  start(agentType, description, prompt, executorFn, modelOverride, toolCallId) {
    let agentId = crypto.randomUUID();
    let abortController = new AbortController();

    let agent = {
      agentId,
      toolCallId: toolCallId ?? `bg-${agentId}`,
      agentType,
      description,
      prompt,
      status: "running",
      startedAt: Date.now(),
      modelOverride
    };

    this.agents.set(agentId, agent);
    this.abortControllers.set(agentId, abortController);
    this.onChangeCallback?.();

    // executorFn is the actual LLM agent call — returns a Promise
    let promise = executorFn(abortController.signal)
      .then(result => {
        if (agent.status === "running") {
          agent.status = "completed";
          agent.completedAt = Date.now();
          agent.result = result;
        }
        return result;
      })
      .catch(err => {
        if (agent.status === "running") {
          agent.status = "failed";
          agent.completedAt = Date.now();
          agent.error = String(err);
          let failResult = {
            textResultForLlm: `Background agent "${agentType}" failed: ${agent.error}`,
            resultType: "failure",
            error: agent.error
          };
          agent.result = failResult;
          return failResult;
        }
        return agent.result;
      })
      .finally(() => {
        this.pendingPromises.delete(agentId);
        this.abortControllers.delete(agentId);
        this.onChangeCallback?.();
      });

    this.pendingPromises.set(agentId, promise);
    return agentId;
  }

  async getResult(agentId, wait = false, timeout = 30000) {
    let agent = this.agents.get(agentId);
    if (!agent) return;
    if (agent.status !== "running") return { agent, result: agent.result };
    if (!wait) return { agent };

    // Race the agent's promise against a timeout
    let promise = this.pendingPromises.get(agentId);
    let result = await Promise.race([
      promise,
      new Promise(resolve => setTimeout(() => resolve("timeout"), timeout))
    ]);

    if (result === "timeout") return { agent: this.agents.get(agentId), timedOut: true };
    return { agent: this.agents.get(agentId), result: agent.result };
  }

  list(includeCompleted = true) {
    let all = Array.from(this.agents.values());
    return includeCompleted ? all : all.filter(a => a.status === "running");
  }
}
```

### Session wiring

```js
// In the session constructor:
this.backgroundAgentRegistry = new VGe();
this.detachedShellRegistry = new fVe();

// Both notify the UI when tasks change
this.backgroundAgentRegistry.setOnChangeCallback(
  () => this.notifyBackgroundTaskChange()
);
this.detachedShellRegistry.setOnChangeCallback(
  () => this.notifyBackgroundTaskChange()
);
```

### Sub-agent callback chain

```js
// When a sub-agent is invoked via the task tool:
async function invokeSubAgent(agentDef, context) {
  let callback = toolCallId && context.createSubAgentCallback
    ? context.createSubAgentCallback(toolCallId)
    : defaultCallback;

  // Signal session boundary (start)
  await h6(callback, "start", agentDef.name, toolCallId,
           agentDef.displayName, agentDef.description);

  // Get or create the agent instance
  let { agent, tools } = await context.getOrCreateAgent(callback, toolCallId, modelOverride);

  // Run the agent loop (prompt → LLM → tool calls → repeat)
  // This is the Promise that backgroundAgentRegistry tracks
}
```

---

## 4. Agent Definitions (YAML)

### Built-in agent types

| Agent | Model | Tools | Purpose |
|-------|-------|-------|---------|
| **explore** | claude-haiku-4.5 | grep, glob, view, GitHub MCP (read-only), Bluebird | Fast codebase Q&A, <300 word answers |
| **task** | claude-haiku-4.5 | `*` (all) | Command execution, brief success / verbose failure |
| **code-review** | (not shown) | All CLI tools (read-only) | High signal-to-noise code review |
| **general-purpose** | (Sonnet-class) | All CLI tools | Full-capability agent in separate context |
| **research** | (not shown) | (not shown) | Deep research with web + GitHub search |

### Agent YAML structure

```yaml
name: task
displayName: Task Agent
description: >
  Execute development commands like tests, builds, linters, and formatters.
model: claude-haiku-4.5
tools:
  - "*"                    # Wildcard = all available tools
promptParts:
  includeAISafety: true
  includeToolInstructions: true
  includeParallelToolCalling: true
  includeCustomAgentInstructions: false   # Sub-agents don't get custom instructions
  includeEnvironmentContext: false        # Sub-agents don't get env context
prompt: |
  You are a command execution agent...
  On SUCCESS: Return brief one-line summary
  On FAILURE: Return full error output for debugging
```

### Explore agent — tool allowlist

The explore agent has a curated read-only tool set including:
- File tools: `grep`, `glob`, `view`, `lsp`
- GitHub MCP: `get_commit`, `get_file_contents`, `issue_read`, `list_*`, `search_*`
- Bluebird (code intelligence): `search_file_content`, `do_vector_search`, `do_hybrid_search`, `get_source_code`, `get_class_or_struct_*`, `get_function_*`, `retrieve_commits_*`

---

## 5. The SQL Tool

### Architecture

The `sql` tool is a **first-class built-in tool** registered directly in the agent's tool list — not an MCP server and not a bash wrapper.

### SQLite driver: Node.js built-in `node:sqlite`

```js
// From the bundle:
Sgt = require("node:sqlite").DatabaseSync;
this.db = new Sgt(dbPath);  // Synchronous API, Node.js 22+
```

**Zero external dependencies** — no `better-sqlite3`, no native `.node` addons for SQLite. Uses the `DatabaseSync` class from Node's built-in `node:sqlite` module.

### Two databases (v0.0.420+)

| Database | Parameter | Access | Location | Purpose |
|----------|-----------|--------|----------|---------|
| **Session** | `"session"` (default) | Read/Write | `<session-dir>/session.db` | Per-session scratch data |
| **Session Store** | `"session_store"` | Read-only | Global | Cross-session history, FTS5 search |

### Tool schema

```js
{
  name: "sql",
  input_schema: {
    description: "A 2-5 word summary (e.g., 'Insert auth todos')",  // required
    query: "The SQL query to execute",                                // required
    database: "session" | "session_store"                             // optional, default: "session"
  }
}
```

### Query execution flow

```
sql tool call
  │
  ├─ Security check: blocks ATTACH, LOAD_EXTENSION, PRAGMA database_list, PRAGMA key/rekey
  │
  ├─ Multi-statement? (contains ; with text after it)
  │   └─ db.exec(query) → { rows: [], rowsAffected: 0 }
  │
  ├─ Single DDL? (CREATE / ALTER / DROP)
  │   └─ db.exec(query) → { rows: [], rowsAffected: 0 }
  │
  ├─ Single SELECT?
  │   └─ db.prepare(query).all() → { rows: [...], columns: [...] }
  │
  └─ Single DML? (INSERT / UPDATE / DELETE)
      └─ db.prepare(query).run() → { rowsAffected: N, lastInsertRowid: N }
```

### Default tables (auto-created on first access)

```sql
CREATE TABLE IF NOT EXISTS todos (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    status TEXT DEFAULT 'pending'
      CHECK(status IN ('pending', 'in_progress', 'done', 'blocked')),
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS todo_deps (
    todo_id TEXT NOT NULL,
    depends_on TEXT NOT NULL,
    PRIMARY KEY (todo_id, depends_on),
    FOREIGN KEY (todo_id) REFERENCES todos(id),
    FOREIGN KEY (depends_on) REFERENCES todos(id)
);
```

### Security guardrails

Blocked SQL patterns (regex):
- `/\bATTACH\b/i`
- `/\bLOAD_EXTENSION\b/i`
- `/\bPRAGMA\s+database_list\b/i`
- `/\bPRAGMA\s+(?:key|rekey)\b/i`

---

## 6. Inter-Agent Communication

### There is none (by design)

Sub-agents **do not communicate with each other**. The coordination model is:

```
┌─────────────┐
│  Main Agent  │ ← orchestrator (fleet prompt)
│  (LLM turn)  │
└──────┬───────┘
       │ dispatches via task tool (parallel Promise.all)
       │
  ┌────┴─────┬──────────┬──────────┐
  ▼          ▼          ▼          ▼
┌─────┐  ┌─────┐  ┌─────┐  ┌─────┐
│Agent│  │Agent│  │Agent│  │Agent│   ← each is a separate LLM conversation
│  A  │  │  B  │  │  C  │  │  D  │      running as a Promise
└──┬──┘  └──┬──┘  └──┬──┘  └──┬──┘
   │        │        │        │
   └────────┴────┬───┴────────┘
                 ▼
          ┌─────────────┐
          │  session.db  │  ← SQLite (shared, serialized by event loop)
          │  (todos,     │
          │   todo_deps) │
          └─────────────┘
```

1. **Main agent** writes todos to SQLite, dispatches sub-agents
2. **Sub-agents** read their todo, do the work, write `status = 'done'` back to SQLite
3. **Main agent** polls SQLite after sub-agents return to check status
4. **No IPC, no message channels, no shared memory** — SQLite is the sole coordination bus
5. **No race conditions** — `DatabaseSync` is synchronous, and Node's event loop serializes all access

---

## 7. Session Lifecycle

```js
// Session instance holds all state:
class Session {
  backgroundAgentRegistry = new VGe();       // tracks running sub-agents
  detachedShellRegistry = new fVe();         // tracks detached shell processes
  usageMetricsTracker = new Nit(startTime);  // premium request counting

  // Shutdown emits metrics
  shutdown(type = "routine", errorReason) {
    emit("session.shutdown", {
      shutdownType: type,
      totalPremiumRequests,
      totalApiDurationMs,
      codeChanges: { linesAdded, linesRemoved, filesModified },
      modelMetrics,
      currentModel
    });
  }
}
```

---

## 8. Feature Flags

```js
const featureFlags = {
  CUSTOM_AGENTS:        "on",
  CCA_DELEGATE:         "on",
  FLEET_COMMAND:        "on",        // ← Generally available
  LSP_TOOLS:           "on",
  PLAN_COMMAND:         "on",
  AUTOPILOT_MODE:      "on",
  PLUGIN_COMMAND:       "on",
  CONTENT_EXCLUSION:   "staff",
  SUBAGENT_COMPACTION: "staff-or-experimental",
  DIAGNOSE:            "staff",
  TUIKIT_COMMAND:      "off",
  // ... and more
};

// Flags can be overridden via:
// 1. Server-side feature_flags.enabled list
// 2. Environment variable: COPILOT_CLI_ENABLED_FEATURE_FLAGS="FLAG1,FLAG2"
// 3. Individual env vars: FLAG_NAME=true/false
```

---

*Document generated 2026-03-04 from Copilot CLI v0.0.411/v0.0.420 bundle analysis.*
