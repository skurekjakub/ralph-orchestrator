# oh-my-opencode — Technical Research Report

> Research date: 2025-07-14
> Source: `~/repositories/oh-my-opencode/`
> Purpose: Extract patterns and architecture insights for Ralph Orchestrator

---

## 1. Agent Orchestration / Sisyphus Delegation

### Mechanism

The system uses a **prompt-engineered delegation model** — Sisyphus (the orchestrator agent) decides what to delegate based on dynamic system prompt content, not programmatic routing logic. At startup, the system introspects all available agents, tools, skills, and categories, then generates prompt sections (delegation tables, key triggers, category guides) that teach Sisyphus when and how to delegate.

**Delegation flow:**

1. Sisyphus receives a user request and follows a phased prompt: Phase 0 (Intent Gate — key trigger matching), Phase 1 (Codebase Assessment), Phase 2A (Exploration via explore/librarian sub-agents), Phase 2B (Implementation via category+skills delegation), Phase 2C (Failure Recovery), Phase 3 (Completion).
2. When delegating, Sisyphus calls the `task()` tool with either a `category` (mapped to a model, e.g. `visual-engineering` → `gemini-3-pro`) or a `subagent_type` (named agent like `oracle`).
3. The `task()` tool resolves the target model via a priority chain: user override → sisyphus-junior default → category default → fallback. It then creates an OpenCode session via `client.session.create()` and sends the prompt via `client.session.promptAsync()`.
4. Results flow back to the parent agent through session completion detection (polling + `session.idle` events) or through the `background_output()` tool for async tasks.

**Category → Model mapping** (from constants.ts):

| Category           | Default Model          |
| ------------------ | ---------------------- |
| visual-engineering | gemini-3-pro           |
| ultrabrain         | gpt-5.3-codex (xhigh)  |
| deep               | gpt-5.3-codex (medium) |
| artistry           | gemini-3-pro           |
| quick              | claude-haiku-4-5       |
| unspecified-low    | claude-sonnet-4-6      |
| unspecified-high   | claude-opus-4-6 (max)  |
| writing            | kimi-for-coding / k2p5 |

Each category also has `CATEGORY_PROMPT_APPENDS` — domain-specific system prompt sections injected into the sub-agent.

**Agent roles:**

- **Sisyphus**: Primary orchestrator. Generates dynamic prompts from available agent metadata. Thinking budget: 32K (Claude), reasoningEffort "medium" (GPT).
- **Hephaestus**: Autonomous deep worker. Key difference: "MUST keep going until task is completely resolved." Has `<turn_end_self_check>` section. Mode = "primary", designed for GPT Codex models.
- **Oracle**: Read-only consultation. DENIES write/edit/apply_patch/task. Has effort estimates (Quick/Short/Medium/Large).
- **Explore**: Codebase search specialist. DENIES write tools AND `call_omo_agent`. Returns structured `<results>` XML. Cost="FREE".
- **Librarian**: External docs/OSS search. Uses context7, websearch, grep_app, gh CLI. Multi-phase discovery (request classification → doc discovery → execution → evidence synthesis). Cost="CHEAP".

**Sub-agent tool restrictions:** Explore and Librarian use `call_omo_agent()` (restricted to explore/librarian agents only), not the full `task()` tool. This prevents recursive deep delegation from lightweight agents.

### Key Files

| File                                           | Role                                                                                                                |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `src/agents/sisyphus.ts`                       | ~500 lines. Main orchestrator agent factory. Builds dynamic system prompt.                                          |
| `src/agents/hephaestus.ts`                     | ~400 lines. Autonomous deep worker agent.                                                                           |
| `src/agents/oracle.ts`                         | Read-only consultation agent.                                                                                       |
| `src/agents/explore.ts`                        | Codebase grep specialist.                                                                                           |
| `src/agents/librarian.ts`                      | External documentation/OSS search agent.                                                                            |
| `src/agents/dynamic-agent-prompt-builder.ts`   | Core prompt assembly — builds delegation tables, key triggers, tool selection, category guides from agent metadata. |
| `src/agents/types.ts`                          | `AgentMode`, `AgentCategory`, `AgentCost`, `AgentPromptMetadata`, `BuiltinAgentName`.                               |
| `src/tools/delegate-task/tools.ts`             | The `task()` tool implementation. Routes to sync/background/continuation/unstable execution paths.                  |
| `src/tools/delegate-task/category-resolver.ts` | Resolves category → model, detects unstable agents.                                                                 |
| `src/tools/delegate-task/constants.ts`         | `DEFAULT_CATEGORIES`, `CATEGORY_PROMPT_APPENDS`, `CATEGORY_DESCRIPTIONS`.                                           |
| `src/tools/call-omo-agent/tools.ts`            | Restricted delegation tool for sub-agents (explore/librarian only).                                                 |

### Patterns Worth Noting

- **Dynamic prompt generation from metadata.** Agent metadata (`useWhen`, `avoidWhen`, `triggers`, `dedicatedSection`, `cost`, `category`) drives prompt content. Adding a new agent automatically updates Sisyphus's delegation tables without touching Sisyphus code.
- **Category-based model routing.** Abstraction layer between "what kind of work" and "which model." Allows model swaps without agent code changes. User overrides are respected via priority chain.
- **Cost-aware delegation.** Agents are tagged FREE/CHEAP/EXPENSIVE. Sisyphus's prompt includes cost guidance — prefer FREE explore over EXPENSIVE oracle for simple lookups.
- **Tool deny-lists per agent role.** Sub-agents are constrained by denying tool names. Explore can't write files. Oracle can't delegate tasks. This is enforced at the tool registration level.
- **Unstable agent detection.** `category-resolver.ts` has special handling for "unstable" models (gemini, minimax, kimi) — uses a different execution path (`executeUnstableAgentTask`) with presumably more error handling.
- **Thinking budget differentiation.** Claude gets explicit thinking budget (32K tokens). GPT gets `reasoningEffort` setting. Both are configured per-agent.

### Limitations / Concerns

- **All intelligence is in prompts.** The delegation "routing" is entirely prompt-engineered. If the LLM misinterprets the delegation table, it could choose wrong categories or skip delegation entirely. No programmatic guardrails enforce correct routing.
- **Model-specific prompting is implicit.** `isGptModel()` helper exists but per-model prompt tuning is limited to thinking budget differences. The same delegation instructions go to Claude and GPT despite different instruction-following characteristics.
- **Hardcoded model names in constants.** `DEFAULT_CATEGORIES` contains literal model names (`gpt-5.3-codex`, `gemini-3-pro`). These will need updating as models change.
- **Complex prompt assembly.** The dynamic prompt builder generates large system prompts with many sections. Token budget for the system prompt could become a concern with many agents/tools/skills registered.
- **No structured output for delegation decisions.** Sisyphus doesn't use tool_choice or structured output to ensure it delegates correctly — it's purely free-form tool calling.

---

## 2. Hashline Edit Tool

### Mechanism

Hashline is a **content-addressed line editing system**. Each line in a file gets a 2-character hash derived from its line number and content. The format is `LINE#HASH` (e.g., `42#VK`). When the agent wants to edit a file, it references lines by their hash-tagged identifiers, and the system validates that the line content hasn't changed since the agent read it.

**Hash computation:** `computeLineHash(lineNumber, content)` strips whitespace from the content, creates input `${lineNumber}:${stripped}`, hashes with `Bun.hash.xxHash32`, then maps the hash to a 2-character code using `HASHLINE_DICT` — a 256-entry lookup table built from characters `ZPMQVRWSNKTXJBYH`.

**Edit flow:**

1. Agent reads a file → `hashline-read-enhancer` hook transforms output from `LINE: content` to `LINE#HASH:content` format.
2. Agent calls `hashline_edit()` with operations referencing `LINE#HASH` identifiers.
3. System validates ALL line references upfront by recomputing hashes from current file content.
4. If all valid: sorts edits bottom-to-top (highest line first to preserve line numbers), applies sequentially.
5. Returns updated file content with new hashline identifiers.

**Edit operations:** `set_line` (replace single line), `replace_lines` (replace range), `insert_after` (add lines), `replace` (find-and-replace within a line).

**Smart content handling:** The system strips hashline prefixes (`42#VK:`) and diff markers (`+`/`-`) from new content the agent provides (since agents often include these in their edits). It also restores leading indentation from template lines.

### Key Files

| File                                            | Role                                                                                           |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `src/tools/hashline-edit/hash-computation.ts`   | xxHash32 computation, 2-char hash encoding via HASHLINE_DICT.                                  |
| `src/tools/hashline-edit/validation.ts`         | `parseLineRef()`, `validateLineRef()`, `validateLineRefs()` — batch validation before editing. |
| `src/tools/hashline-edit/edit-operations.ts`    | `applyHashlineEdits()` — sorts bottom-to-top, applies operations. Smart prefix stripping.      |
| `src/tools/hashline-edit/tools.ts`              | `createHashlineEditTool()` — tool definition, generates diff, writes file.                     |
| `src/hooks/hashline-read-enhancer/hook.ts`      | `tool.execute.after` hook — transforms `read` output to add `LINE#HASH` format.                |
| `src/hooks/hashline-edit-diff-enhancer/hook.ts` | Captures before/after content on `write` tool, generates unified diff for TUI display.         |

### Patterns Worth Noting

- **Content-addressed validation solves stale-read edits.** The hash encodes both line number AND content. If another edit shifted lines or changed content, the hash won't match and the edit is rejected with a clear error (expected hash, actual hash, current content). This is strictly better than line-number-only references.
- **Bottom-to-top application order.** By sorting edits from highest to lowest line, insertions and deletions don't invalidate subsequent line references. Classic technique, well-implemented.
- **Upfront batch validation.** ALL line refs are validated before ANY edits apply. Prevents partial edit states where some edits succeed and others fail.
- **Hook-based integration.** The read enhancer is a `tool.execute.after` hook — transparently transforms file read output without changing the read tool itself. Clean separation.
- **Prefix stripping heuristic.** Agents frequently include hashline identifiers or diff markers in replacement text. The system strips these automatically. Practical and well-motivated.

### Limitations / Concerns

- **2-char hash has collision risk.** 256 possible hash values (16×16 from HASHLINE_DICT). In a 500-line file, birthday-paradox probability of at least one collision is significant. Collisions don't cause data loss (the line number disambiguates), but could confuse agents if two lines with different content share the same hash display.
- **xxHash32 is fast but not the strongest.** Acceptable for this use case (it's not security-critical), but the 2-char encoding severely limits the effective hash space regardless of the underlying hash function quality.
- **Bun-specific.** `Bun.hash.xxHash32` ties this to the Bun runtime. Not portable to Node.js without replacing the hash function.
- **Whitespace stripping before hashing.** Lines that differ only in whitespace will produce the same hash. This is intentional (reduces spurious hash changes from formatting), but could mask meaningful indentation changes in whitespace-sensitive languages (Python, YAML).

---

## 3. Ralph Loop

### Mechanism

Ralph Loop is an **iterative task completion system** with two complementary components:

**A. Ralph Loop (explicit loop):**

1. User starts a loop with a prompt, max iterations, and a `completion_promise` string.
2. The system sends the prompt to an agent session.
3. On `session.idle`, the system checks if the agent output the completion promise (pattern: `<promise>COMPLETION_TEXT</promise>`).
4. If promise found → loop completes. If not found and iterations remain → continuation prompt injected.
5. Two continuation strategies:
   - **"continue"**: Injects a continuation message into the existing session.
   - **"reset"**: Creates a new session, copies context, starts fresh.
6. Continuation prompt template: `[SYSTEM REMINDER - RALPH LOOP X/Y] Your previous attempt did not output the completion promise. Continue working... When FULLY complete, output: <promise>PROMISE</promise>. Original task: PROMPT`.

**B. Todo Continuation Enforcer (implicit loop):**

1. On `session.idle`, checks if the agent has incomplete todos (via OpenCode's todo API).
2. If incomplete todos exist and various guards pass (cooldown, not recovering, not recently aborted, no background tasks running):
   - Starts a countdown (user can cancel).
   - Re-fetches todos, builds a prompt listing incomplete items.
   - Injects via `client.session.promptAsync()`.
3. Has **exponential backoff** on consecutive failures to prevent infinite retry storms.
4. Skips agents without write permission.

**C. Stop Continuation Guard:**
A cross-cutting concern — maintains a `stoppedSessions` Set. When a user stops a session, both Ralph Loop and Todo Continuation Enforcer check this set and skip continuation. Cleared on new user message (`chat.message` hook).

**Completion detection** uses two methods:

1. `detectCompletionInTranscript()` — reads JSONL transcript file, searches for promise pattern.
2. `detectCompletionInSessionMessages()` — uses OpenCode API to check last 3 assistant messages.

State is persisted to disk, enabling crash recovery.

### Key Files

| File                                                             | Role                                                                                                 |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `src/hooks/ralph-loop/ralph-loop-hook.ts`                        | Main hook factory — composes state controller + session recovery + event handler.                    |
| `src/hooks/ralph-loop/ralph-loop-event-handler.ts`               | Listens for session.idle/deleted/error. Detects completion, increments iterations.                   |
| `src/hooks/ralph-loop/completion-promise-detector.ts`            | Searches for `<promise>COMPLETION_PROMISE</promise>` in transcripts and API messages.                |
| `src/hooks/ralph-loop/loop-state-controller.ts`                  | State management: active, iteration, max_iterations, strategy, prompt, session_id. Persists to disk. |
| `src/hooks/ralph-loop/iteration-continuation.ts`                 | "reset" and "continue" strategy implementations.                                                     |
| `src/hooks/ralph-loop/continuation-prompt-builder.ts`            | Builds `[SYSTEM REMINDER - RALPH LOOP X/Y]` messages.                                                |
| `src/hooks/todo-continuation-enforcer/handler.ts`                | Session.idle handler for todo-based continuation.                                                    |
| `src/hooks/todo-continuation-enforcer/idle-event.ts`             | Guard checks: cooldown, abort detection, background task check, model resolution.                    |
| `src/hooks/todo-continuation-enforcer/continuation-injection.ts` | Builds todo-list prompt and injects continuation. Exponential backoff.                               |
| `src/hooks/stop-continuation-guard/hook.ts`                      | Cross-cutting stop mechanism. Set-based tracking, cleared on new user message.                       |

### Patterns Worth Noting

- **Promise-based completion detection.** The agent must output a specific XML-tagged string to signal completion. This is explicit, unambiguous, and doesn't rely on heuristic interpretation of the agent's output. Clean contract between orchestrator and agent.
- **Dual continuation strategies.** "continue" is cheaper (same session context), "reset" is more robust (fresh context avoids confusion from prior failed attempts). Good to offer both.
- **Exponential backoff on failures.** The todo enforcer backs off on consecutive failures, preventing infinite nudging when the agent is stuck.
- **Cross-cutting stop guard.** Prevents both loop types from continuing after user intervention. Cleared on new user message — elegant lifecycle management.
- **Persistence enables crash recovery.** Loop state written to disk means the system can resume after restarts.

### Limitations / Concerns

- **Completion promise requires agent cooperation.** If the agent doesn't output the promise (or outputs it in a non-standard format), the loop continues until max iterations. No fallback heuristic.
- **Session.idle is ambiguous.** "Idle" could mean the agent finished OR it's waiting for tool results OR it hit a rate limit. The todo enforcer has several guard checks to avoid false positives, but the signal itself is noisy.
- **No quality gate.** The loop only checks if the agent claims completion (via promise), not whether the output is actually correct. A hallucinating agent can emit the promise and stop the loop prematurely.
- **Transcript file dependency.** One completion detection method reads JSONL transcript files. If the file format changes or the file isn't written (different CLI), detection fails silently (falls back to API method, but still fragile).

---

## 4. Background Agent / Sub-agent Spawning

### Mechanism

Background agents are **separate OpenCode sessions** spawned via the OpenCode API — not OS-level process forking. The `BackgroundManager` class (~2000 lines) handles the full lifecycle:

**Launch flow:**

1. Parent agent calls `task(run_in_background=true, ...)`.
2. `BackgroundManager.launch()` creates a task with `pending` status, adds to concurrency queue.
3. `processKey()` acquires a concurrency slot from `ConcurrencyManager`, calls `startTask()`.
4. `startTask()` creates an OpenCode session via `client.session.create()`, optionally spawns a tmux pane for visual monitoring, sends prompt via `promptWithModelSuggestionRetry` (fire-and-forget).

**Event-driven progress tracking:**

- `handleEvent()` processes OpenCode events: `message.updated`, `message.part.updated/delta` (tracks tool calls, last tool used, last update time), `session.idle` (completion check), `session.error` (fallback retry), `session.deleted`/`session.status`.

**Completion detection on idle:**

- Validates output existence and checks for incomplete todos.
- Atomically marks task complete, releases concurrency slot, notifies parent.

**Parent notification:**

- `notifyParentSession()` sends `<system-reminder>` to parent session with task results.
- Batches notifications: when all background tasks for a parent complete, sends an "ALL COMPLETE" summary.

**Failure recovery:**

- `tryFallbackRetry()` selects next model from the task's `fallbackChain`, checks provider connectivity, re-queues with new model.
- Crash recovery: polls running tasks on interval, prunes stale tasks (30min TTL), validates session status via API.

**Concurrency management:**

- `ConcurrencyManager` enforces per-model, per-provider, and default concurrency limits.
- Default limit: 5 concurrent tasks.
- Promise-based queue: `acquire(key)` returns a promise that resolves when a slot is available, along with a `release()` function.
- Uses settled-flag pattern to prevent double-resolution of queued promises.

### Key Files

| File                                           | Role                                                                                                                              |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `src/features/background-agent/manager.ts`     | ~2000 lines. Full lifecycle: launch, event handling, completion, fallback, polling, parent notification.                          |
| `src/features/background-agent/concurrency.ts` | `ConcurrencyManager` — per-model/provider limits, promise-based queue.                                                            |
| `src/features/background-agent/spawner.ts`     | `createTask()` + `startTask()` — older code path for task creation.                                                               |
| `src/features/background-agent/types.ts`       | `BackgroundTask`, `TaskProgress`, `LaunchInput`, `ResumeInput`. Status enum: pending/running/completed/error/cancelled/interrupt. |
| `src/tools/delegate-task/tools.ts`             | Entry point — dispatches to sync/background/continuation paths.                                                                   |
| `src/tools/background-task/`                   | `background_output()` and `background_cancel()` tools for parent agent.                                                           |

### Patterns Worth Noting

- **Session-level isolation via API.** Each sub-agent gets its own OpenCode session — independent conversation context, no shared state. Clean isolation.
- **Fallback chains.** Tasks declare a list of fallback models. On failure, the system tries the next model automatically. Provider connectivity is checked before retry (avoids burning retries on a down provider).
- **Concurrency with fairness.** Promise-based queue ensures FIFO ordering per concurrency key. Per-model limits prevent one model's tasks from starving others.
- **Fire-and-forget with event-driven tracking.** `promptAsync` is non-blocking. Progress is tracked through event subscriptions, not polling the API. Efficient and responsive.
- **Tmux pane spawning.** Optional visual monitoring of sub-agent sessions in tmux panes. Useful for debugging but not required for operation.
- **Stale task pruning.** 30-minute TTL catches orphaned tasks from crashed sessions. Prevents resource leaks.

### Limitations / Concerns

- **~2000 line manager class.** `BackgroundManager` is a god class handling launch, events, completion, fallback, polling, and notification. High cognitive load, difficult to test in isolation.
- **Event-driven complexity.** The `handleEvent()` method processes 7+ event types with complex state transitions. Race conditions between events (e.g., idle + error arriving simultaneously) could be subtle.
- **30-minute stale TTL is arbitrary.** Long-running tasks (e.g., large refactors) could legitimately take >30 minutes. The TTL should be configurable or based on activity (last tool call time) rather than absolute wall clock.
- **Parent notification batching.** The "ALL COMPLETE" notification waits for all background tasks. If one task is slow/stuck, the parent doesn't get notified about completed tasks.
- **Tight coupling to OpenCode SDK.** `client.session.create()`, `client.session.promptAsync()`, event subscription API — all OpenCode-specific. Not portable.

---

## 5. Skill-Embedded MCPs

### Mechanism

Skills are **markdown files** (SKILL.md) with YAML frontmatter that can declare embedded MCP server configurations. When an agent loads a skill, any declared MCP servers become available through the `skill_mcp()` tool.

**Skill discovery** (`discoverAllSkills`): Loads from 6 locations in priority order:

1. opencode-project (highest)
2. opencode-global
3. project (.claude directory)
4. project (.agents directory)
5. user (.claude directory)
6. user (.agents directory)

Deduplicates by name — higher-priority locations win.

**Skill structure:**

```yaml
---
name: dev-browser
description: Browser automation with persistent page state
mcp:
  browser-server:
    type: stdio
    command: bash
    args: ["server.sh"]
---
# Skill content (markdown instructions for the agent)
```

**MCP client management** (`SkillMcpManager`):

- Clients are keyed per-session: `${sessionID}:${skillName}:${serverName}`.
- Supports **stdio** (local process) and **HTTP** (remote) transports.
- Lazy connection: clients created on first tool call, not at skill load time.
- Idle timeout: 5 minutes of inactivity → auto-disconnect.
- Retry: `withOperationRetry()` — 3 retries with reconnect on transient failures.
- OAuth step-up handling for authenticated HTTP MCP servers.

**Tool flow:**

1. Agent calls `skill_mcp(mcp_name="browser-server", tool_name="navigate", arguments={url: "..."})`.
2. Tool finds the matching MCP server by searching loaded skills for `mcp_name`.
3. Gets or creates client via `SkillMcpManager.getOrCreateClient()`.
4. Calls `manager.callTool()` / `manager.listTools()` / `manager.readResource()` / `manager.getPrompt()`.
5. Optional `grep` parameter filters large outputs.

### Key Files

| File                                           | Role                                                                            |
| ---------------------------------------------- | ------------------------------------------------------------------------------- |
| `src/features/opencode-skill-loader/loader.ts` | `discoverAllSkills()` — multi-location discovery with priority dedup.           |
| `src/features/opencode-skill-loader/types.ts`  | `LoadedSkill`, `SkillMetadata` — skill data model, YAML frontmatter schema.     |
| `src/features/skill-mcp-manager/manager.ts`    | `SkillMcpManager` — MCP client lifecycle, retry, idle timeout, session scoping. |
| `src/features/skill-mcp-manager/types.ts`      | `SkillMcpConfig`, `ManagedClient` — config and client types.                    |
| `src/tools/skill-mcp/tools.ts`                 | `skill_mcp()` tool — routes to correct MCP server, delegates to manager.        |
| `builtin-skills/dev-browser/SKILL.md`          | Example: browser automation with stdio MCP server.                              |
| `builtin-skills/git-master/SKILL.md`           | Example: git operations expert (no MCP, pure instruction skill).                |

### Patterns Worth Noting

- **Skills = instructions + optional infrastructure.** A skill can be pure markdown (instructions only, like git-master) OR markdown + MCP servers (like dev-browser). Unified discovery regardless of whether MCP is involved.
- **Session-scoped MCP isolation.** Client key `${sessionID}:${skillName}:${serverName}` means different agent sessions get isolated MCP server instances. No cross-session state leakage.
- **Lazy + idle timeout = efficient resource use.** MCP servers only start when called, auto-stop after 5 minutes idle. Avoids keeping unused servers running.
- **Priority-based dedup across 6 locations.** Project-level skills override global defaults. Users can customize without forking builtin skills.
- **Grep filter on output.** Large MCP responses can be filtered inline, reducing token consumption. Practical for tools that return verbose data.

### Limitations / Concerns

- **No MCP server health checks.** The manager retries on failure but doesn't proactively check server health. A permanently broken MCP server will burn 3 retries per call.
- **Stdio server lifecycle.** For stdio-type servers, each session gets its own process. If the agent spawns many sessions with the same skill, that's many server processes. The idle timeout helps, but there's no global limit on MCP server processes.
- **YAML frontmatter parsing fragility.** Skill definition depends on correct YAML in a markdown file. No schema validation is mentioned — malformed YAML could fail silently.
- **Security surface.** Skills from user/.claude or project directories can declare arbitrary MCP servers (stdio commands). A malicious project could include a skill that spawns a harmful process. The 6-location discovery doesn't appear to have a trust model.
- **Single `skill_mcp` tool indirection.** All MCP calls go through one generic tool rather than generating tool-specific wrappers. This means the agent must know the MCP server's tool names and argument schemas from the skill description, not from tool registration. Less type-safe.

---

## Cross-Cutting Observations

### Patterns Ralph Orchestrator Could Adopt

1. **Dynamic prompt generation from metadata.** Instead of hardcoding delegation instructions, generate them from agent/tool metadata. Scales with new agents.
2. **Content-addressed edit validation.** Hashline's approach of embedding content hashes in line references prevents stale-edit bugs. Simpler than full file checksums.
3. **Completion promise pattern.** Explicit, unambiguous completion signal. Better than heuristic "did the agent stop talking" detection.
4. **Session-scoped MCP isolation.** Client keying by session ID prevents cross-task state leakage.
5. **Concurrency management with per-model limits.** Prevents one model's tasks from consuming all slots.

### Patterns to Be Cautious About

1. **2000-line manager classes.** BackgroundManager does too much. Better to decompose into lifecycle, events, concurrency, and notification concerns.
2. **Prompt-only routing.** No programmatic guardrails on delegation decisions. Consider hybrid: prompt guides the decision, code validates it.
3. **Tight SDK coupling.** Heavy reliance on OpenCode's session API makes the patterns non-portable. Abstract the session concept if you want to support multiple backends.
