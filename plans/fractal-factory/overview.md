# Fractal Factory — Plan Overview

## Goal

Build a fully autonomous fractal agent system ("Fractal Factory") that takes a domain description + supporting documents as input and produces a complete, validated fractal orchestrator agent family as output. The factory itself follows the fractal pattern: session orchestrator → coordinators → specialists.

## What Makes This Meta

The Fractal Factory is a fractal agent that *produces* fractal agents. The input is a domain specification; the output is a directory of agent prompt files, artifact schemas, a bootstrap script, skills, and golden test scenarios — everything needed to invoke the produced agent system.

## Key Design Decisions

1. **Full depth-3 support from day one.** The produced agents may have orchestrator → coordinator → specialist → sub-specialist where warranted. The `depth-analyzer` specialist decides per-coordinator whether depth-3 is needed.

2. **Multi-modal input.** The factory accepts `context.json` (structured), `domain-brief.md` (narrative), `domain-docs/*.md` (supporting documents), `invariants.md` (behavioral rules), `exemplars/` (golden I/O pairs), and `constraints.json` (bounds).

3. **Structural + audit-skill oracle verification.** Produced agents are validated against the validation checklist AND by invoking the existing `agent-as-function-audit` and `fractal-workflow-eval` skills as oracle validators.

4. **Golden test scenarios.** The factory produces test scenarios (input→expected-output) alongside the agent family, enabling future regression testing.

5. **User-specified output path.** Produced agents are written to `context.json.target.outputDirectory`, not inside the factory's artifact directory.

## Pipeline Mapping

| Pass | Phase Group | Purpose |
|---|---|---|
| 1 | Domain Comprehension | Scan domain-brief, domain-docs, invariants, exemplars → produce structured domain model |
| 2 | Architecture Synthesis | Design the pipeline, artifact schemas, depth decisions |
| 3 | Blueprint | Plan the agent roster, routing tables, artifact flow, golden tests |
| 4 | Agent Writing | Write each agent prompt (coder→reviewer loop), bootstrap script, skills |
| 5 | Structural Audit | Validate against checklist, run audit-skill oracles |
| 6 | Gap Hunting | Adversarial search for missing agents, broken routing, artifact orphans |
| 7 | Package & Document | Write user guide, architecture doc, final report |

## Agent Count Estimate

| Level | Count | Details |
|---|---|---|
| Session orchestrator | 1 | `fractal-factory` |
| Coordinators | 5 | discovery, planning, execution, verification, delivery |
| Discovery specialists | 4 | domain-scanner, invariant-extractor, asset-auditor, exemplar-analyzer |
| Planning specialists | 6 | pipeline-architect, artifact-designer, depth-analyzer, roster-planner, routing-planner, test-planner |
| Execution specialists | 3 | prompt-writer, prompt-reviewer, infra-writer |
| Verification specialists | 3 | checklist-validator, audit-oracle, gap-hunter |
| Delivery specialists | 3 | packager, documentation-writer, report-writer |
| **Total** | **25** | 1 + 5 + 4 + 6 + 3 + 3 + 3 |

## Output Directory (Produced Agent Family)

```
<target-output-dir>/
├── context.json              # Seed context for produced system
├── bootstrap.sh              # Bootstrap script
├── agents/                   # All agent prompt files
│   ├── <domain>.agent.md     # Session orchestrator
│   ├── <domain>-*-coordinator.agent.md
│   └── <domain>-*.agent.md   # Specialists
├── skills/                   # Domain-specific skills (if any)
├── schemas/                  # Artifact JSON schemas
├── tests/                    # Golden test scenarios
│   ├── test-plan.json
│   └── scenarios/
└── docs/
    ├── architecture.md       # Architecture documentation
    ├── user-guide.md         # How to use the produced system
    └── roster.md             # Agent roster reference
```

## Phases (Summary)

| Phase | Title | Files Created |
|---|---|---|
| 1 | Bootstrap & Infrastructure | Bootstrap script, directory scaffold, seed artifacts, context.json template |
| 2 | Discovery Specialists | 4 agent prompts for domain comprehension |
| 3 | Planning Specialists | 6 agent prompts for architecture synthesis + blueprint |
| 4 | Execution Specialists | 3 agent prompts for the writer→reviewer loop |
| 5 | Verification Specialists | 3 agent prompts for auditing + gap hunting |
| 6 | Delivery Specialists | 3 agent prompts for packaging + documentation |
| 7 | Coordinators + Orchestrator | 5 coordinator + 1 session orchestrator + guide agent |

Phase 7 is written last because coordinators reference specialist names and result codes, and the orchestrator references coordinator names.
