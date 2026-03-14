---
name: agent-fractal-orchestrator-architecture
description: "Design and build autonomous multi-agent systems using the fractal orchestrator pattern: a depth-2 hierarchy where a session orchestrator dispatches coordinators that dispatch specialists, all communicating through filesystem artifacts and status.json routing signals. The system is fully autonomous end-to-end — the user invokes the orchestrator once and it runs the entire pipeline without human input. Use this skill whenever designing a new autonomous agent system for a complex multi-phase task, creating an agent family that needs discovery→analysis→planning→execution→verification→delivery phases, building a self-healing pipeline with re-entry loops and convergence detection, or any request that involves creating 10+ cooperating agents that must work without human intervention. Also triggers on: 'build an autonomous agent system', 'create an agent pipeline', 'fractal orchestrator', 'multi-pass agent architecture', 'agent convergence loop', 'self-correcting agent pipeline', 'coordinator pattern', 'create agents for this task', 'gap-hunting loop', 'adversarial verification agents', 'coder-reviewer loop', 'parity checking agents', 'risk analysis agents', or any request to build a complex autonomous multi-agent workflow from scratch."
---

# Fractal Orchestrator Architecture

A pattern for building fully autonomous multi-agent systems that process complex, multi-phase tasks end-to-end without human intervention. The user invokes the top-level orchestrator once; it dispatches the entire pipeline through coordinators and specialists, loops on failures, hunts for gaps, and converges to completion.

This skill captures the generalized architecture. It works for any domain — migration, refactoring, documentation overhaul, security audit, codebase modernization, test suite generation, compliance review, or any task that benefits from structured discovery → analysis → planning → execution → verification → delivery.

## When to Use This Skill

| Signal | This skill applies |
|---|---|
| Task has 5+ distinct phases that must run in order | Yes |
| Task requires discovery before planning, planning before execution | Yes |
| Task needs adversarial verification (did we miss anything?) | Yes |
| Task benefits from coder→reviewer loops with rejection/retry | Yes |
| Task must be fully autonomous — no human-in-the-loop after launch | Yes |
| Task needs crash recovery and resumability | Yes |
| Simple 2-3 agent orchestrator with no phases | No — use agent-as-function skill instead |
| Human-in-the-loop at every step | No — use agent-creator skill instead |

## Relationship to Other Skills

- **agent-as-function**: Covers the foundational pattern (status.json, manifest.json, artifact handoff). This skill builds ON TOP of that foundation with the full fractal hierarchy, multi-pass pipeline, convergence loops, and autonomous dispatch.
- **agent-creator**: Human-in-the-loop family creation. This skill produces families that run WITHOUT human-in-the-loop.
- **agent-subagent-wiring**: Wires one subagent at a time. This skill designs the entire family architecture before any wiring.

## Architecture Overview

```
User invokes once
       ↓
Session Orchestrator (pure router, depth 0)
       ↓ dispatches via status.json routing
Coordinators (pure routers, depth 1)
       ↓ dispatch via status.json routing
Specialists (leaf workers, depth 2)
       ↓ write artifacts + status.json
    ← control returns up the chain →
```

**Depth-2 hierarchy, not deeper.** Three levels is the sweet spot — orchestrator → coordinator → specialist. Deeper nesting creates context loss and debugging nightmares. If a specialist seems too complex, split it into two specialists under the same coordinator rather than adding depth.

**Every agent at every level writes `status.json`.** This is the ONLY mechanism for routing decisions. Upstream agents never read downstream `output.md` files for control flow — only for progress counting.

## Core Principles

Read [references/core-principles.md](references/core-principles.md) for the full explanation of each principle. Summary:

1. **Pure Router Rule** — Orchestrators and coordinators never do substantive work. They read status files and dispatch.
2. **Filesystem-Only Communication** — All data flows through JSON/markdown files in a shared artifact directory. No conversation context relay.
3. **Status-Driven Routing** — Every routing decision is based on `result` codes in `status.json` files. Fixed vocabulary per agent.
4. **Autonomous Dispatch** — Agents invoke subagents directly. No human in the loop. The pipeline runs until completion or a `blocked`/`escalated` status.
5. **Crash Resumability** — Every agent writes state before and after work. On restart, the orchestrator reads all status files and picks up where it left off.
6. **Convergence Loops** — Verification passes can trigger re-entry into earlier phases. A convergence signal (e.g., gap-hunter finds zero new items) indicates completeness.
7. **Anti-Laziness Invariants** — Adversarial agents (gap-hunters, reviewers) have explicit rules preventing shallow work.
8. **Prepend-Only Audit Log** — The manifest file is prepend-only (newest first) so agents can read the most recent state without scanning the entire file.

## The Multi-Pass Pipeline

The generalized pipeline has 7 passes. Not every system needs all 7 — skip passes that don't apply to the domain. But the ordering is universal:

| Pass | Purpose | Generalized Name | What Happens |
|---|---|---|---|
| 1 | **Discovery** | Surface Inventory | Domain-specific mappers scan the subject and produce a feature/item inventory |
| 2 | **Analysis** | Behavioral Semantics | Analyze each item deeply — extract invariants, rules, dependencies, error paths |
| 3 | **Planning** | Task Decomposition | Decompose analyzed items into dependency-ordered execution slices |
| 4 | **Execution** | Implementation | Execute each slice (coder→reviewer→writer loop) |
| 5 | **Verification** | Parity/Quality Check | Verify each slice against its invariants via oracle validators |
| 6 | **Gap Hunting** | Adversarial Completeness | Search for anything missed, trigger re-entry if found |
| 7 | **Delivery** | Hardening + Handoff | Production readiness checks, documentation, final report |

**Re-entry rules:** Pass 6 can loop back to Pass 2 or 3. Pass 5 failures loop back to Pass 4. This continues until convergence (gap-hunter finds nothing new) or the system is told to proceed.

Read [references/pipeline-design.md](references/pipeline-design.md) for how to design the pipeline for a specific domain.

## Designing a New System

Follow this process when creating a fractal orchestrator for a new domain:

### Phase 1: Domain Analysis

1. **Identify the subject matter.** What is being processed? (codebase, document set, infrastructure, API surface, etc.)
2. **Identify the deliverable.** What does "done" look like? (migrated code, test suite, audit report, remediation PR, etc.)
3. **Identify the phases.** Map the task to the 7-pass pipeline. Which passes apply? Which can be skipped?
4. **Identify the domains.** For discovery (Pass 1), what distinct domains need separate mappers? (In migration: UI, routes, API, data, jobs, config. In a security audit: auth, network, data, secrets, dependencies, compliance.)
5. **Identify the invariants.** What behavioral rules must be preserved or verified? These drive the entire verification pipeline.

### Phase 2: Agent Roster Design

Read [references/agent-roster-template.md](references/agent-roster-template.md) for the roster template.

Map roles to agents:

| Role | Count | Pattern |
|---|---|---|
| Session Orchestrator | 1 | Pure router. Reads coordinator status files, dispatches coordinators, updates progress. |
| Coordinators | 3–6 | One per pipeline phase group. Pure routers. Each owns a subset of passes. |
| Discovery Specialists | 2–8 | One per domain. Parallel, no dependencies between them. |
| Analysis Specialists | 1–3 | Sequential (semantics before dependencies). |
| Planning Specialists | 1–3 | Sequential (decomposition before risk analysis). |
| Execution Specialists | 2–4 | Coder + reviewer + optional test-writer. Loop pattern. |
| Verification Specialists | 2–5 | Oracle validators + aggregator + gap-hunter. |
| Delivery Specialists | 2–4 | Hardening + documentation + handoff. Sequential. |

**Total: 15–35 agents** is typical. This is not bloat — each agent has a single, clear responsibility defined by its artifact contract.

### Phase 3: Artifact Design

Read [references/artifact-contracts.md](references/artifact-contracts.md) for the full artifact reference.

Design the shared artifact directory. Every system needs:

| Artifact | Purpose | Written By | Read By |
|---|---|---|---|
| `context.json` | Task parameters (user fills in) | User/bootstrap | All agents |
| `progress.json` | Pipeline progress counters | Orchestrator | Orchestrator, user |
| `manifest.json` | Prepend-only audit log | All agents | Debugging, documentation-writer |
| `agents/*/status.json` | Routing signal per agent | Each agent | Parent coordinator/orchestrator |
| `agents/*/output.md` | Narrative output (human-readable) | Each agent | Only humans and documentation-writer |

Domain-specific artifacts follow the pattern:
| Artifact | Purpose | Example |
|---|---|---|
| Inventory file | All discovered items | `feature-inventory.json`, `vulnerability-inventory.json` |
| Analysis matrix | Deep analysis per item | `behavior-matrix.json`, `threat-model.json` |
| Dependency graph | Relationships between items | `dependency-graph.json` |
| Task graph | Ordered execution slices | `task-graph.json` |
| Risk register | Per-slice risks + mitigations | `risk-register.json` |
| Verification matrix | Per-slice oracle results | `verification-matrix.json` |

### Phase 4: Write the Agents

Read [references/agent-prompt-template.md](references/agent-prompt-template.md) for the universal agent template.

Write agents in this order:
1. **Bootstrap script** — creates the artifact directory with seed files
2. **Leaf specialists** — they have no subagents, simplest to write
3. **Coordinators** — routing tables reference specialist names, so specialists must exist
4. **Session orchestrator** — routing table references coordinator names

### Phase 5: Validation

Read [references/validation-checklist.md](references/validation-checklist.md) for the complete checklist.

## Key Patterns

### The Coder-Reviewer Loop

The execution coordinator dispatches coder → reviewer in a loop with a max retry count:

```
for each slice in dependency order:
  gate: all dependencies verified?
  dispatch coder(slice)
  dispatch reviewer(slice)
  if rejected and attempts < max:
    re-dispatch coder with rejection feedback
  elif rejected and attempts >= max:
    mark slice as blocked
  else:
    dispatch test-writer(slice)
    mark slice as implemented
```

The reviewer MUST check every invariant by name and produce evidence for each. "Looks good" reviews are explicitly forbidden by the anti-laziness rules.

### The Gap-Hunting Convergence Loop

After all slices are verified, the gap-hunter performs an adversarial search for anything missed. If it finds new items:
- Items needing deep analysis → re-enter Pass 2
- Items ready for planning → re-enter Pass 3

The convergence signal is: gap-hunter finds zero new items. Track `newItemsPerCycle` as a list — when the last entry is 0, the system has converged.

On the FIRST gap-hunting cycle, finding zero items is suspicious. The gap-hunter must document its search methodology exhaustively and explicitly acknowledge if nothing was found.

### The Read-Modify-Write Pattern

Multiple agents write to the same JSON files (inventory, task-graph, etc.). Each agent must:
1. Read the current file
2. Add/modify ONLY their own entries (identified by domain key, agent name, or slice ID)
3. Preserve ALL existing entries from other agents
4. Recompute summary/aggregate fields
5. Write the file back

This is critical because agents run sequentially, not in parallel. Each agent sees the accumulated state from all prior agents.

### Feature ID Validation

Before any agent creates references to items (feature IDs in slices, slice IDs in verification), it must validate that the referenced ID actually exists in the source artifact. This prevents phantom references where a planner creates a slice referencing a feature that wasn't actually discovered.

### Confidence Scoring and Unknowns

Discovery agents assign confidence scores (0.0–1.0) to items and log unknowns explicitly. This is better than guessing — downstream agents can use confidence to prioritize and the gap-hunter can use unknowns as starting points.

### Anti-Laziness Rules

Adversarial agents (reviewers, gap-hunters, hardening checkers) have explicit rules:
- Must show work (search methodology, per-item evidence)
- Cannot produce blank approvals ("looks good")
- Must report per-category even if empty ("Routes: 0 new items found after scanning N files with M patterns")
- Suspicion rules for first-pass empty results
- Cannot use "probably fine" — either verified or flagged

### Mode Detection

Coordinators that handle multiple passes (e.g., a planning coordinator handling both analysis and planning) detect their mode by checking which artifacts exist:
- If X doesn't exist → run pass that creates X
- If X exists but Y doesn't → run pass that creates Y
- If both exist → return `already-complete`

This makes the system idempotent — re-running a coordinator that already completed is safe.

## Bootstrap Script Template

Read [references/bootstrap-template.md](references/bootstrap-template.md) for the generalized bootstrap script.

The bootstrap creates the artifact directory with seed files:
- `progress.json` with all counters at zero
- `manifest.json` as empty array
- `context.json` with empty fields for the user to fill
- `agents/` directory
- Domain-specific subdirectories

## Status Contract (Universal)

Every agent writes a `status.json` with this exact schema:

```json
{
  "agent": "<agent-name>",
  "task_id": "<hierarchical-task-path>",
  "status": "completed | failed",
  "result": "<fixed-vocabulary-result-code>",
  "summary": "<~100 token routing summary>",
  "artifacts": ["<relative-path-to-output>"],
  "next_hint": "<suggested-next-agent-or-null>",
  "iteration": 1
}
```

- `result` codes are a FIXED vocabulary per agent. Define them in the agent's prompt.
- `summary` is for routing, not for humans. Keep it under 100 tokens.
- `next_hint` is advisory — the parent makes the actual routing decision.
- `iteration` tracks re-entry cycles.

## Manifest Entry (Universal)

Every agent prepends to the manifest (newest first):

```json
{
  "timestamp": "<ISO-8601-UTC>",
  "agent": "<agent-name>",
  "artifacts": ["<relative-paths>"],
  "status": "completed | failed",
  "result": "<result-code>",
  "iteration": 1
}
```

## Further Reading

- [references/core-principles.md](references/core-principles.md) — Deep explanation of each architectural principle
- [references/pipeline-design.md](references/pipeline-design.md) — How to adapt the 7-pass pipeline for a specific domain
- [references/agent-roster-template.md](references/agent-roster-template.md) — Blank roster spreadsheet with role descriptions
- [references/artifact-contracts.md](references/artifact-contracts.md) — Full artifact schema reference with examples
- [references/agent-prompt-template.md](references/agent-prompt-template.md) — Universal agent prompt structure
- [references/bootstrap-template.md](references/bootstrap-template.md) — Generalized bootstrap script
- [references/validation-checklist.md](references/validation-checklist.md) — Post-creation validation checklist
- [references/worked-example.md](references/worked-example.md) — Full worked example: migration domain mapped to architecture
