# OverRalph — Self-Assembling Agent Swarm

A meta-agent that receives vague, high-level goals and autonomously builds specialized Ralph agents to accomplish them. Every capability it needs is either an existing agent tool or one it creates on-demand via the Agent Factory.

## Core Principle

**OverRalph never does substantive work itself.** If it doesn't know something, it creates (or reuses) a research agent. If it needs something built, it creates a builder agent. If it needs something reviewed, it creates a reviewer agent. OverRalph is a pure goal decomposer and tool orchestrator — it thinks about WHAT needs to happen, never HOW to do it.

This is the agent-as-function principle taken to its extreme: the orchestrator's only job is dispatch and routing, and the tools it dispatches are themselves agents.

---

## Architecture

### The MCP Server: ralph-factory-server

A single MCP server that wraps the Agent Factory and all created agents. Its tool set is dynamic — it grows as OverRalph creates agents.

#### Static tools (always available)

| Tool | Input | Output | Purpose |
|---|---|---|---|
| `factory_create_agent` | `{ description, output_path? }` | `{ agent_name, tool_name, files[], status }` | Create a new agent family via the full factory pipeline. Auto-registers the created agent as a new dynamic tool. |
| `factory_list_agents` | `{}` | `{ agents: [{ tool_name, description, subagents }] }` | Inventory all available agent tools (built-in + factory-created) |
| `factory_improve_agent` | `{ agent_name, findings }` | `{ status, changes[] }` | Refine an existing agent based on run results (uses scientist pipeline) |

#### Dynamic tools (registered at runtime)

Each agent created by `factory_create_agent` is automatically registered as a callable tool:

```jsonc
{
  "tool_name": "agent_<slug>",           // e.g., "agent_api_researcher"
  "description": "<from agent's description>",
  "input": {
    "prompt": "string",                  // The task for this agent
    "artifact_root?": "string",          // Where to write artifacts (auto-generated if omitted)
    "context_files?": "string[]"         // Extra files to seed the agent's context
  },
  "output": {
    "status": "string",                  // completed | failed
    "result": "string",                  // Agent's result code
    "summary": "string",                 // One-line summary
    "artifacts": "string[]"              // Paths to output files
  }
}
```

#### Execution model

The MCP server is a thin execution wrapper:

```
MCP tool call
  → write prompt + context to temp directory
  → run agent CLI (copilot/claude) with the agent's .agent.md
  → wait for exit block (===RALPH_RESULT_START===)
  → parse status, result, summary, artifacts
  → return structured MCP response
```

The agent's full conversation is internal — OverRalph only sees the structured result.

---

## OverRalph Bootstrap Process

### Identity

OverRalph is a **goal-directed meta-agent**. It receives a high-level goal and decomposes it into a sequence of agent invocations. It has three absolute rules:

1. **Never research, analyze, write, code, or review anything yourself.** Every substantive task goes to an agent tool.
2. **If you lack information, create a research agent for it.** Don't reason about unknowns — build an agent that can investigate them and report back.
3. **If no suitable agent exists, create one before proceeding.** Never skip a capability gap — always fill it.

### The Loop

```
RECEIVE goal

DECOMPOSE:
  1. What do I know about this goal? → Almost nothing (that's the point)
  2. What do I need to know? → Create/invoke a research agent to find out
  3. What agents already exist? → factory_list_agents()
  
PLAN (informed by research results):
  4. Break the goal into concrete subtasks
  5. For each subtask:
     a. Does an existing agent tool fit? → Use it
     b. No? → factory_create_agent() → Use the newly registered tool
  
EXECUTE:
  6. Invoke agent tools for each subtask in dependency order
  7. Read each result (status + summary + artifacts)
  8. If a result is partial/failed:
     - Try re-invoking with a refined prompt
     - If still failing, create a more specialized agent
  
SYNTHESIZE:
  9. Are all subtasks covered? Review results against the original goal
  10. If gaps remain → generate new subtasks, repeat from (5)
  11. If complete → compile final output

EXIT:
  12. Write summary of all agent invocations, results, and artifacts
```

### The "Always Delegate" Rule in Practice

| OverRalph needs to... | Wrong approach | Right approach |
|---|---|---|
| Understand the codebase | Read files and reason about structure | `factory_create_agent("Research agent that analyzes repo structure and conventions")` → invoke it |
| Know what APIs exist | Grep for endpoint definitions | `factory_create_agent("API inventory agent that discovers and catalogs all REST endpoints")` → invoke it |
| Write documentation | Write the docs inline | `factory_create_agent("Documentation writer agent for REST API endpoints")` → invoke it |
| Check quality | Review the output | `factory_create_agent("Documentation quality reviewer")` → invoke it |
| Decide what to do next | Think hard about priorities | `factory_create_agent("Task prioritizer that analyzes a goal and work-in-progress to recommend next steps")` → invoke it |

The last row is the extreme case — even meta-level reasoning can be delegated if the decision is complex enough. OverRalph's own reasoning should be limited to: goal decomposition, agent selection/creation, and result synthesis.

### First Invocation Bootstrapping

When OverRalph starts with a vague goal, its first action is always:

1. `factory_list_agents()` — see what's already available
2. If a general-purpose research agent exists → invoke it for goal analysis
3. If not → `factory_create_agent("Research agent that analyzes a high-level goal, explores the relevant workspace/codebase, and produces a structured task breakdown with dependencies")` → invoke it
4. Research agent's output becomes the basis for the plan

This means the FIRST agent OverRalph creates is always a researcher. The researcher's output shapes everything that follows.

---

## Dynamic Tool Registration

### How it works

When `factory_create_agent` completes:

1. The factory pipeline runs: explorer → architect → builder → auditor
2. The created `.agent.md` file is written to the output path
3. The MCP server reads the new agent's frontmatter (name, description)
4. A new tool is registered in the MCP server's tool set:
   - Tool name: `agent_<slug>` (derived from agent name)
   - Description: from the agent's `description` field
   - Input/output: uniform interface (see above)
5. The tool is immediately available for OverRalph to call

### Tool lifecycle

```
factory_create_agent("API researcher for the users service")
  → Factory runs (explorer → architect → builder → auditor)
  → Creates: .github/agents/api-researcher-users.agent.md
  → Registers: tool "agent_api_researcher_users"
  → Returns: { tool_name: "agent_api_researcher_users", status: "created" }

agent_api_researcher_users({ prompt: "Inventory all endpoints under /api/users" })
  → MCP server spins up the agent
  → Agent runs autonomously
  → Returns: { status: "completed", result: "researched", summary: "Found 23 endpoints..." }
```

### Tool persistence

Created agents persist across OverRalph sessions:
- The `.agent.md` files remain in the output directory
- On MCP server restart, it scans the output directory and re-registers all agents as tools
- The agent library compounds over time — each run potentially adds reusable agents

---

## Resource Management

### Cost model

| Operation | Cost (Opus calls) | When to use |
|---|---|---|
| `factory_create_agent` | ~4 (explorer + architect + builder + auditor) | When no existing agent fits |
| `factory_improve_agent` | ~3 (scientist pipeline) | When an agent produced poor results |
| `agent_<name>` invocation | 1+ (depends on agent's subagent count) | Normal task execution |
| OverRalph reasoning | 1 per iteration of the main loop | Always |

### Optimization strategies

1. **Reuse aggressively.** Before creating, always check `factory_list_agents()`. A "close enough" agent with a refined prompt is cheaper than creating a new one.
2. **Create multi-capability agents.** Instead of one agent per endpoint, create one "API documentation writer" that handles all endpoints.
3. **Batch similar subtasks.** Group related work into one agent invocation.
4. **Cache research.** If a research agent already analyzed the codebase, point other agents to its artifacts instead of re-researching.

---

## Feedback Loops

### Agent improvement

When an agent returns `partial` or `failed`:

1. **Retry with better prompt** (cheapest)
   - Append clarifying context to the prompt
   - Re-invoke the same agent tool
   
2. **Create a more specialized agent** (medium cost)
   - Use the failure summary to inform a narrower agent description
   - `factory_create_agent("Specialized agent that handles <the specific case that failed>")`

3. **Improve the existing agent** (expensive but durable)
   - `factory_improve_agent(agent_name, findings)` — runs the scientist pipeline
   - Results in a better agent for future invocations

### Meta-learning

OverRalph can maintain a `learning.md` file tracking:
- Which agent descriptions produced good agents vs. bad ones
- Which tasks were better served by specialized vs. general agents
- Common failure modes and their resolutions
- Optimal subtask granularity for different goal types

This file persists across sessions and informs future goal decomposition.

---

## Example Flow

**Goal:** "Make our REST API documentation world-class"

```
1. factory_list_agents() → [builder, planner, ...] — no API-specific agents

2. factory_create_agent("Research agent that analyzes API documentation quality, 
   identifies gaps, and produces a prioritized improvement plan")
   → Registers: agent_api_doc_researcher

3. agent_api_doc_researcher("Analyze the API docs in this repo. What's missing? 
   What's outdated? What's the gap between current state and world-class?")
   → Result: "43 endpoints undocumented, 12 with outdated examples, 
      no authentication guide, no error code reference"

4. OverRalph decomposes researcher's output into subtasks:
   a. Write endpoint docs (43 endpoints, batched into 5 groups)
   b. Update outdated examples (12 endpoints)
   c. Write authentication guide (1 doc)
   d. Write error code reference (1 doc)
   e. Review all new docs

5. factory_create_agent("API documentation writer that creates REST endpoint 
   docs with examples, error codes, and authentication requirements")
   → Registers: agent_api_doc_writer

6. factory_create_agent("API documentation reviewer that validates accuracy, 
   completeness, and adherence to the repo's doc conventions")
   → Registers: agent_api_doc_reviewer

7. For each batch of endpoints:
   agent_api_doc_writer("Write docs for: GET /users, POST /users, ...")
   agent_api_doc_reviewer("Review the docs just written for /users endpoints")
   If reviewer rejects → agent_api_doc_writer("Fix these issues: ...")

8. agent_api_doc_writer("Write the authentication guide based on ...")
   agent_api_doc_writer("Write the error code reference based on ...")
   agent_api_doc_reviewer("Review auth guide and error reference")

9. Synthesize: All 43 endpoints documented, examples updated, guides written.
   3 agents created, 15 invocations total.
```

---

## Implementation Phases

### Phase 1: MCP Server Shell
- Build `ralph-factory-server` MCP server
- Implement `factory_create_agent` as a wrapper around the existing Agent Factory agent
- Implement `factory_list_agents` as a directory scanner
- Implement dynamic tool registration on agent creation

### Phase 2: Agent Execution Wrapper
- Build the thin execution wrapper (prompt → CLI agent → parse exit block → MCP response)
- Support both Copilot CLI and Claude Code CLI
- Handle timeouts, failures, and partial results

### Phase 3: OverRalph Agent
- Write the orchestrator agent template
- Implement the goal decomposition → research → plan → execute → synthesize loop
- Wire up the MCP server as its primary tool source

### Phase 4: Persistence & Learning
- Agent library persistence (re-register on restart)
- Session artifacts persistence
- `learning.md` meta-learning file

### Phase 5: Optimization
- Agent reuse heuristics
- Cost tracking and budgeting
- Parallel agent invocations where dependencies allow
- `factory_improve_agent` via scientist pipeline

---

## Open Questions

1. **Concurrency.** Can OverRalph invoke multiple agent tools in parallel? MCP supports concurrent tool calls, but resource contention (CPU, memory, API rate limits) may limit practical parallelism.

2. **Context window management.** If OverRalph runs 20+ agent invocations, its own context fills with tool call results. Need a strategy: summarize completed tasks, archive detailed results to files, keep only active context in the window.

3. **Agent granularity.** When should OverRalph create one multi-subagent family vs. multiple simple agents? Rule of thumb: if subtasks share data flow (A's output feeds B), create a family. If subtasks are independent, create separate agents.

4. **Security.** OverRalph can create arbitrary agents. Need guardrails: output path restrictions, no agents that modify OverRalph itself, no credential access beyond what's explicitly allowed, sandboxed execution.

5. **Human escape hatch.** For v1, fully autonomous. But some goals may hit a point where human judgment is required. A `request_human_input` tool that pauses and waits for user input would add a safety valve without breaking the autonomous model.
