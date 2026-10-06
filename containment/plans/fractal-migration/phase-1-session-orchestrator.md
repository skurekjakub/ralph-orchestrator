# Phase 1: Session Orchestrator

**Status:** not-started
**Agents:** 1
**Dependencies:** Phase 0 (scaffold)

## Objective

Write the top-level session orchestrator agent. This is the root router — the human runs it, it reads coordinator `status.json` files and `progress.json`, and outputs which coordinator to dispatch next.

## Agent: `session-orchestrator.agent.md`

### Role

Pure router. Reads child coordinator `status.json` files and `progress.json`. Never reads narrative output files. Outputs routing decisions for the human.

### Prompt requirements

1. **Pass model** — full 7-pass sequence with dependencies:
   - Pass 1: Discovery (discovery-coordinator)
   - Pass 2: Semantics (planning-coordinator, semantics phase)
   - Pass 3: Planning (planning-coordinator, planning phase)
   - Pass 4: Execution (execution-coordinator)
   - Pass 5: Verification (verification-coordinator, inline mode)
   - Pass 6: Gap Hunting (verification-coordinator, gap-hunting mode)
   - Pass 7: Delivery (delivery-coordinator)

2. **Routing table** — map result codes to actions:
   | Result Code | Action |
   |---|---|
   | `mapped` | Discovery done → dispatch planning-coordinator for semantics |
   | `deepened` | Semantics done → dispatch planning-coordinator for planning |
   | `planned` | Planning done → dispatch execution-coordinator |
   | `implemented` | Slice done → dispatch verification-coordinator (inline) |
   | `verified` | Slice verified → next slice or gap-hunting |
   | `failed-parity` | Parity failed → re-dispatch execution-coordinator for that slice |
   | `uncovered-gap` | New gaps found → re-enter Pass 2 or 3 |
   | `blocked` | Human decision needed |
   | `escalated` | Human decision needed |

3. **Re-entry rules**:
   - Gap-hunter finds items needing analysis → re-enter Pass 2
   - Gap-hunter finds items ready to plan → re-enter Pass 3
   - Parity failed → re-enter Pass 4 for that slice
   - Gap-hunter finds nothing → proceed to Pass 7
   - Human decides → proceed to Pass 7 or terminate

4. **Progress update logic** — after each agent completes, recompute `progress.json` counts from:
   - `feature-inventory.json` (feature counts by status)
   - `task-graph.json` (slice counts by status)
   - `risk-register.json` (open risk counts by severity)
   - `verification-matrix.json` (oracle pass/fail counts)
   - Gap-hunting cycle tracking

5. **Orchestrator purity rule** — MUST read only `status.json` files for routing decisions. Never read `output.md`, `review.md`, or any narrative artifact.

### Inputs

- `.migration/progress.json`
- `.migration/agents/discovery-coordinator/status.json`
- `.migration/agents/planning-coordinator/status.json`
- `.migration/agents/execution-coordinator/status.json`
- `.migration/agents/verification-coordinator/status.json`
- `.migration/agents/delivery-coordinator/status.json`

### Outputs

- Updated `.migration/progress.json`
- `.migration/agents/session-orchestrator/status.json`
- `.migration/agents/session-orchestrator/output.md` (routing decision narrative)
- Prepend to `.migration/migration-manifest.json` (newest first)

## Verification

Test with fake status files:

- [ ] Seed `.migration/agents/discovery-coordinator/status.json` with `result: mapped` → orchestrator outputs "dispatch planning-coordinator for semantics"
- [ ] Seed no status files → orchestrator outputs "dispatch discovery-coordinator"
- [ ] Seed verification-coordinator with `result: uncovered-gap` → orchestrator outputs re-entry to Pass 2 or 3
- [ ] Seed all coordinators as completed with no gaps → orchestrator outputs "dispatch delivery-coordinator"
- [ ] Orchestrator updates `progress.json` with correct counts
- [ ] Orchestrator does NOT read any `output.md` files
