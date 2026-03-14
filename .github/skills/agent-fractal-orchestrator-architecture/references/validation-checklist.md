# Validation Checklist

Run through this checklist after creating a fractal orchestrator system. Every item must pass before the system is considered ready.

## Structural Validation

### Agent Count and Hierarchy
- [ ] Exactly 1 session orchestrator
- [ ] 3–6 coordinators (one per phase group)
- [ ] All specialists have exactly one parent coordinator
- [ ] No agent is deeper than depth 2 (orchestrator → coordinator → specialist)
- [ ] All agents have unique names
- [ ] All names follow `<domain>-<name>` convention

### Frontmatter
- [ ] Every agent file has `name`, `description`, `model` fields
- [ ] `user-invocable: false` on all agents except the orchestrator
- [ ] Descriptions are specific enough to trigger skill matching

### Autonomy
- [ ] Every agent explicitly suppresses interactive tools: "You must never use `ask_questions` or request human input"
- [ ] No agent prompt says "ask the user" or "wait for input"
- [ ] The session orchestrator invokes coordinators as subagents directly

## Routing Validation

### Orchestrator Routing Table
- [ ] Every coordinator is listed in the pass routing table
- [ ] Every pass maps to exactly one coordinator
- [ ] Re-entry rules are defined (which passes can be re-entered, from where)
- [ ] Convergence bounds are set (max gap-hunting cycles)
- [ ] Progress recomputation happens after each coordinator return

### Coordinator Routing Tables
- [ ] Every child specialist is listed in the coordinator's routing table
- [ ] Every possible `result` code from every child has a routing action
- [ ] No unhandled result codes (test: list all child result codes, verify each is in routing table)
- [ ] Loop bounds exist for any looping patterns (coder→reviewer max attempts)

### Status Contracts
- [ ] Every agent writes `status.json` with the universal schema
- [ ] Every agent has documented `result` codes (fixed vocabulary)
- [ ] Result codes are one word or hyphenated compound
- [ ] `summary` field is constrained to ~100 tokens
- [ ] `artifacts` paths are relative from the agent's directory

## Artifact Validation

### Shared Files
- [ ] All shared JSON files have documented schemas
- [ ] Every shared file has a `version` field
- [ ] Every shared file has a `lastUpdated` timestamp
- [ ] Summary/aggregate fields are recomputed, not trusted from agents
- [ ] ID schemes are documented (prefix, padding, sequential allocation)

### Read-Modify-Write
- [ ] Discovery agents that write to shared files use read-modify-write protocol
- [ ] Domain-scoping is clear (each agent only modifies its own domain entries)
- [ ] Summary recomputation happens on every write

### Artifact Flow
- [ ] For every agent, the artifacts it reads have been written by a prior agent in the pipeline
- [ ] No circular artifact dependencies
- [ ] No agent reads an artifact that might not exist without handling the missing-file case

### Context and Bootstrap
- [ ] Bootstrap script creates all required directories
- [ ] Bootstrap script seeds all required JSON files with valid, parseable defaults
- [ ] Bootstrap refuses to run if artifact directory already exists
- [ ] `context.json` template has clear `<FILL:>` markers for user-editable fields
- [ ] All agents that read `context.json` document which fields they need

## Pipeline Validation

### Pass Ordering
- [ ] Pipeline passes are numbered and ordered correctly
- [ ] Each pass's entry condition is satisfied by prior passes' exit conditions
- [ ] No pass assumes work from a later pass

### Re-Entry
- [ ] Gap-hunter output includes re-entry classification (which pass new items should enter)
- [ ] Orchestrator handles re-entry: re-dispatches the correct coordinator
- [ ] Re-entered passes correctly detect their mode (analysis vs. planning) via artifact existence
- [ ] Progress counters update correctly after re-entry cycles

### Convergence
- [ ] Gap-hunting tracks `newItemsPerCycle` list
- [ ] Convergence signal is defined (last entry is 0)
- [ ] Maximum cycle bound exists
- [ ] Delivery coordinator only runs after convergence OR max cycles reached

### Execution Loop
- [ ] Dependency gate implemented (all dependsOn must be "verified")
- [ ] Coder→reviewer loop has max attempts
- [ ] Reviewer checks every invariant by name
- [ ] Blocked slices are logged, not silently skipped
- [ ] Slice status updates happen in task-graph.json after each iteration

## Anti-Laziness Validation

### Reviewer Agent
- [ ] Explicit rule against "looks good" reviews
- [ ] Invariant-by-invariant checklist required
- [ ] Evidence required per invariant (not just pass/fail)
- [ ] Scope boundary checking included

### Gap-Hunter Agent
- [ ] Adversarial framing ("You are an auditor, not helpful")
- [ ] Systematic search methodology per category
- [ ] Per-category reporting even when empty
- [ ] First-pass zero-result suspicion rule
- [ ] Invariant completeness check (every invariant in at least one slice)

### Risk Analyzer
- [ ] Zero risks per unit flagged as suspicious
- [ ] Mitigations must be specific actions (not "be careful")
- [ ] Risk categories are documented and complete

### Hardening Checker
- [ ] Checks beyond functional correctness (performance, security, accessibility, observability)
- [ ] Resolves/flags open risks from risk register
- [ ] Validates rollback readiness

## Resumability Validation

- [ ] Kill the pipeline at each phase boundary and verify restart produces correct routing
- [ ] Status.json files are written AFTER artifacts (not before)
- [ ] Orchestrator routing is purely based on status file contents (no conversation memory)
- [ ] Partial coordinator progress is preserved (not lost on restart)
- [ ] The bootstrap script's guard prevents re-initialization on restart

## Documentation Validation

- [ ] User guide exists explaining quick start, monitoring, stopping/resuming
- [ ] Agent roster is documented (name, role, parent, dispatches)
- [ ] Artifact directory structure is documented
- [ ] The session orchestrator prompt includes the full routing table
- [ ] The bootstrap script includes clear next-steps output
