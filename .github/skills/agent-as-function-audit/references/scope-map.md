# Scope Map

Audit the workflow as a system, not as isolated files.

## Always Inspect

| Surface | What to read | Why |
|---|---|---|
| Orchestrator prompt | `profiles/<profile>/agents/<orchestrator>.agent.md` | Declared ownership, routing rules, hard constraints, forbidden work |
| Subagent prompts | Every subagent named in the orchestrator frontmatter and routing tables | Real input/output contracts and ownership boundaries |
| Workflow router skill | The main workflow skill/router | Phase table and routing expectations |
| Phase references | Standard and revision phase reference files | Where stale ownership rules usually survive |
| Shared artifact contract | Shared contract/include file | Canonical file naming, `status.json`, manifest, iteration rules |
| Profile config | `profiles/<profile>/profile.json` | Mounted skills and actual agent entry points |

## Inspect When Relevant

| Surface | When to include |
|---|---|
| Result parser + tests | When the workflow prints a structured exit block |
| Shared prompt includes | When agent files render workflow or task includes rather than embedding instructions |
| Skill directories | When prompts reference named skills and you need to verify they are mounted, still relevant, or only reachable transitively through other mounted skills |
| MCP/tool references | When ownership depends on who performs JIRA, PR, archive, or browser side effects |

## Inventory Output

Before writing findings, build a simple map:

- orchestrator name
- declared subagents
- standard workflow files
- revision workflow files
- shared artifact contract file
- profile stage skill list
- parser/test files if result blocks are involved
- direct skill references from prompts
- transitive skill references from already-mounted skills to secondary helper skills

If you skip this inventory, you will miss contract drift hiding outside the main agent prompt.
