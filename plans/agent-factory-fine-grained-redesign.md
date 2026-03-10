# Agent Factory Fine-Grained Redesign

## Goal

Replace the current coarse `explorer -> architect -> builder -> auditor` Agent Factory with a fine-grained, audit-heavy factory that:
- audits the roster before implementation starts
- treats each subagent as its own spec and build task
- treats each new skill as its own spec and build task
- audits orchestrator wiring separately from subagent implementation
- runs two full passes from discovery to family audit
- uses the second pass to rediscover the target domain, compare delivered output against the domain, and refine the family again

## New Factory Family

1. `factory-explorer`
2. `factory-roster-architect`
3. `factory-roster-auditor`
4. Loop over each subagent:
   - `factory-subagent-architect`
   - `factory-subagent-auditor`
   - `factory-subagent-builder`
   - `factory-subagent-build-auditor`
5. Loop over each new skill:
   - `factory-skill-architect`
   - `factory-skill-builder`
   - `factory-skill-auditor`
6. `factory-orchestrator-builder`
7. `factory-orchestrator-auditor`
8. `factory-family-integrator`
9. `factory-family-auditor`

## Two-Pass Model

### Pass 1
- Discover the target domain and existing ecosystem
- Design and audit the roster
- Spec, audit, build, and audit each subagent
- Spec, build, and audit each new skill
- Build and audit the orchestrator
- Integrate the family and audit the whole family

### Pass 2
- Re-run discovery against the target domain and the delivered family
- Identify gaps, over-design, missing subagents, missing skills, weak instructions, and integration issues
- Re-run the same fine-grained loops only for changed roster items / subagents / skills / orchestrator wiring
- Re-audit the whole family

## Artifact Layout

```text
.agent-factory/artifacts/{agent-name}/
├── manifest.json
├── state.md
├── pass-1/
│   ├── explorer/
│   ├── roster/
│   │   ├── architect/
│   │   └── auditor/
│   ├── subagents/
│   │   └── {subagent-id}/
│   │       ├── architect/
│   │       ├── auditor/
│   │       ├── builder/
│   │       └── build-auditor/
│   ├── skills/
│   │   └── {skill-id}/
│   │       ├── architect/
│   │       ├── builder/
│   │       └── auditor/
│   ├── orchestrator/
│   │   ├── builder/
│   │   └── auditor/
│   └── family/
│       ├── integrator/
│       └── auditor/
└── pass-2/
    └── same structure
```

## Machine-Readable Control Files

The orchestrator remains a pure router for substantive work, but it may read machine-readable control files for routing state:
- `roster/roster.json`
- `subagents/index.json`
- `skills/index.json`
- `family/refinement.json`

It must never read narrative `output.md` files for substantive content.

## Routing Strategy

### Roster loop
- `factory-explorer -> factory-roster-architect -> factory-roster-auditor`
- Loop architect/auditor until roster approved or max iterations reached

### Per-subagent loop
For each subagent item in `roster.json`:
- spec: `factory-subagent-architect -> factory-subagent-auditor`
- loop until approved
- build: `factory-subagent-builder -> factory-subagent-build-auditor`
- loop until approved

### Per-skill loop
For each new skill in `skills/index.json`:
- `factory-skill-architect -> factory-skill-builder -> factory-skill-auditor`
- route auditor findings to architect if conceptual, builder if implementation-only

### Orchestrator loop
- `factory-orchestrator-builder -> factory-orchestrator-auditor`
- revise until approved

### Family loop
- `factory-family-integrator -> factory-family-auditor`
- if family audit fails, route findings to the relevant local loop rather than patching globally whenever possible

## Deliverables

### Prompt files to create
- `agent-factory-roster-architect.agent.md`
- `agent-factory-roster-auditor.agent.md`
- `agent-factory-subagent-architect.agent.md`
- `agent-factory-subagent-auditor.agent.md`
- `agent-factory-subagent-builder.agent.md`
- `agent-factory-subagent-build-auditor.agent.md`
- `agent-factory-skill-architect.agent.md`
- `agent-factory-skill-builder.agent.md`
- `agent-factory-skill-auditor.agent.md`
- `agent-factory-orchestrator-builder.agent.md`
- `agent-factory-orchestrator-auditor.agent.md`
- `agent-factory-family-integrator.agent.md`
- `agent-factory-family-auditor.agent.md`

### Prompt files to update
- `agent-factory.agent.md`
- `agent-factory-explorer.agent.md`

### Prompt files to retire
- `agent-factory-architect.agent.md`
- `agent-factory-builder.agent.md`
- `agent-factory-auditor.agent.md`

## Exit Criteria

The redesign is complete when:
- the top-level Agent Factory prompt reflects the new roster and two-pass flow
- the new subagents exist with artifact contracts and routing-compatible result codes
- the explorer supports pass-2 rediscovery and comparison against delivered artifacts
- the old coarse architect/builder/auditor prompts are removed from the active family
- the family can be understood as a fine-grained audited factory without additional design notes
