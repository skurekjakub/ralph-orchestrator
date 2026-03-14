# Core Principles

These principles are universal across ALL fractal orchestrator systems. Violating any of them degrades the system's autonomy, reliability, or correctness.

## 1. Pure Router Rule

**Orchestrators and coordinators do zero substantive work.** They:
- Read status.json files from their children
- Make routing decisions (which child to dispatch next, whether to loop)
- Update progress counters
- Dispatch the next child agent as a subagent

They do NOT:
- Read source code, analyze data, or write artifacts (other than progress.json)
- Summarize or transform child output
- Make domain-specific judgments

**Why this matters:** If a coordinator does work, it becomes a monolithic junction point. When it fails, you lose both the routing logic AND the work. Keeping routers pure means failures are localized to specialists, and routing logic is trivially resumable.

**The purity test:** If you removed all domain-specific knowledge from a coordinator prompt and replaced it with a different domain's routing table, would the coordinator still be structurally valid? If yes, it's pure.

## 2. Filesystem-Only Communication

All agent-to-agent data flows through files in the shared artifact directory. Never rely on:
- Conversation context being relayed between agents
- Return values from subagent invocations
- Shared memory or environment variables

**Artifacts are typed JSON.** Each artifact has a defined schema. Agents read and write specific artifacts — never arbitrary files.

**Why this matters:** Filesystem artifacts are inspectable, debuggable, and resumable. If a pipeline crashes, you can inspect every artifact to see the exact state. If you need to manually fix something, you edit a JSON file. If conversation context were the communication medium, crashes would lose all state.

**The filesystem test:** If you killed the pipeline at any point and handed the artifact directory to a human, could they understand the full state and manually continue the work? If yes, the communication is properly externalized.

## 3. Status-Driven Routing

Every routing decision is based on the `result` field in a child's `status.json`. Each agent has a **fixed vocabulary** of result codes. The parent's routing table maps result codes to actions.

Example routing table in a coordinator:
```
result: "discovered" → dispatch next mapper
result: "deepened"   → dispatch semantics-analyzer
result: "planned"    → dispatch dependency-analyzer
result: "blocked"    → escalate to orchestrator
```

**Why this matters:** Status-driven routing is deterministic and testable. You can verify routing correctness by checking: for every possible result code from every child, does the parent have a defined action? If any result code is unhandled, the system has a routing gap.

**The routing test:** List all possible `result` codes across all children of a coordinator. Verify each one maps to an action in the coordinator's routing table. If any are missing, add them.

## 4. Autonomous Dispatch

After receiving a routing decision, agents invoke their subagents immediately — no human-in-the-loop. The pipeline runs from first invocation to final handoff without intervention.

**Suppression of human-interaction tools:** Every agent in the system includes a directive to never use `ask_questions` or similar interactive tools. This is essential because the underlying AI runtime (Copilot, Claude Code, etc.) may have built-in interactive tools that would pause the pipeline waiting for human input.

**Why this matters:** Human-in-the-loop systems cannot run as background processes, scheduled tasks, or CI jobs. They require active monitoring. Autonomous systems can be fired and forgotten.

## 5. Crash Resumability

Every agent writes its status AFTER completing work. On restart:
1. The orchestrator reads ALL status files
2. It determines which pass was in progress
3. It re-dispatches the next unfinished coordinator

This works because:
- Specialists write artifacts THEN status.json (so artifacts without status = incomplete work to redo)
- Coordinators write progress THEN return (so partial progress is always recorded)
- The orchestrator's routing table is derived purely from status files (no conversation memory needed)

**The crash test:** At any point in the pipeline, kill the session. Restart from the orchestrator. Does it resume correctly? If any agent re-does completed work, the resumability is broken.

## 6. Convergence Loops

Open-ended verification can run forever. The system needs convergence signals:

- **Gap-hunting cycle limit:** Track `cyclesCompleted` and `newItemsPerCycle: [5, 2, 0]`. When the last entry is 0, declare convergence.
- **Coder-reviewer retry limit:** After N attempts (usually 3), mark the slice as `blocked` rather than retrying forever.
- **Re-entry bounds:** Gap-hunting can re-enter earlier passes at most M times before the orchestrator moves to delivery.

**Why this matters:** Without convergence bounds, a perfectionist gap-hunter could loop indefinitely. The bounds ensure the system terminates while still catching most issues through multiple passes.

## 7. Anti-Laziness Invariants

AI agents under-deliver when allowed to. Adversarial agents need explicit rules preventing shallow work:

- **Reviewers** cannot say "looks good" — must check each invariant by name with evidence
- **Gap-hunters** must document search methodology per category, even for zero-result categories
- **Risk analyzers** must flag at least one risk per work unit (there is always risk)
- **First-pass zero results are suspicious** — the agent must acknowledge this and explain why the search was thorough

These rules go in the agent prompt itself, not in the coordinator. The specialist enforces them on itself.

## 8. Prepend-Only Audit Log

The manifest is append-only (newest entry first). Every agent prepends its entry when completing work. This creates a chronological audit trail that:
- Tells the documentation-writer exactly what happened
- Enables debugging by showing the order of operations
- Can be replayed to verify the pipeline sequence

**Never overwrite manifest entries.** Only prefix new entries. If a JSON array, insert at index 0.
