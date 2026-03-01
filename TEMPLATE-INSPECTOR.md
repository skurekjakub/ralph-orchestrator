Done. Created visualize-agent-graph.ts — a self-contained graph visualizer that traverses the full reference chain from agent files through Liquid includes down to skill definitions.

Usage:

```sh
npx tsx scripts/visualize-agent-graph.ts                              # all profiles
npx tsx scripts/visualize-agent-graph.ts --profile ralph-docs         # single profile
npx tsx scripts/visualize-agent-graph.ts --agent ralph.ralph          # single agent
npx tsx scripts/visualize-agent-graph.ts --profile ralph-docs --mermaid  # Mermaid output
```

What it does:

Discovers all skills from skills as the catalog of known terminal nodes
Parses agent files for {% render %} includes, YAML agents: sub-agent declarations, and bold skill name references
BFS-traverses includes for nested renders and skill mentions
Traverses skill-to-skill cross-references (e.g. ralph-workflow-write → ralph-build-errors)
Tracks Liquid conditionals ({% if %}, {% unless %}, {% else %}) and labels edges accordingly: [isRevision], [not isRevision], [triggerParams.codesamples]
Groups consecutive children under the same condition bracket
Reports unreferenced skills at the bottom
Supports Mermaid flowchart output via --mermaid