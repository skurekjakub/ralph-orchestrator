# Adding a subagent to an existing family

A new `.agent.md` file is not enough on its own. The subagent is wired only when the owning orchestrator can dispatch it and route on every result it returns, and when its siblings know which of its artifacts to read and which work they no longer own. If the phase sequence changes too, also follow `workflow-phases.md`.

## Decide first

Promote work into a subagent when the orchestrator (or another agent) is doing substantive analysis, writing, review or formatting itself, the work has a clear artifact boundary, and it can return a small fixed set of result codes. Keep it inside the existing agent when it is a tiny administrative step or inseparable from that agent's core job.

Answer these before editing: Who calls it, the orchestrator or another subagent? Which artifacts does it read and write? What are its result codes? Which prompt sections become stale? Does it create or change a retry loop?

| Role                                           | Shape                                            | Typical result codes                            | Usually changes                                                                                |
| ---------------------------------------------- | ------------------------------------------------ | ----------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Phase owner (researcher, writer/coder, scribe) | Owns a pipeline step                             | `researched`/`implemented`/`partial`/`composed` | Orchestrator roster, routing, ordering; downstream readers                                     |
| Reviewer                                       | Approval-style verdict, may loop                 | `approved`/`needs-revision` (or `pass`/`fail`)  | Review gate, loop cap, writer reads its findings on later iterations, scribe includes verdicts |
| Scout / analyst                                | Gathers context for a downstream owner           | `scouted`/`analyzed`/`blocked`                  | Writer/reviewer read its artifact                                                              |
| Helper / validator                             | Called by another subagent, not the orchestrator | helper-specific                                 | Parent subagent's `subagents:` list and prompt only                                            |
| Scribe / aggregator                            | Composes handoff from upstream artifacts         | `composed`/`partial`                            | Remove inline handoff composition from the orchestrator                                        |

Model new prompts on the live families: `profiles/ralph-docs/agents/` (ralph, malph, stacky) and `profiles/ralph-vscode/agents/` (ralph, malph, robinson/vasco explorers).

## File-by-file checklist

1. **New prompt** `profiles/<id>/agents/ralph.<name>.agent.md`:
   - canonical frontmatter: `name: <name>`, `description`, `model` (alias such as `opus`), plus `subagents: [...]` if it dispatches helpers
   - `{% section "artifact-contract" %}{% render 'agent-as-function-contract' %}{% endsection %}`
   - result-code table (small, stable, routable; never a vague `done`)
   - inputs (only the artifacts it needs, under `{{ artifactDir }}/…`), outputs (`{{ artifactDir }}/<name>/output.md` + `status.json` + manifest append)
   - narrow mission and explicit "you do not …" boundaries
2. **Orchestrator frontmatter**: add `<name>` to `subagents: [...]`. If you miss this, the subagent is not rendered and cannot be dispatched.
3. **Orchestrator roster** (`### Subagents` table): add a row, and fix any adjacent rows whose ownership changed.
4. **Routing table**: add a route into the subagent from its predecessor state and a row for **every** result code it can return. Update successor routes.
5. **Ordering constraints**: add hard "X must run before Y" rules where needed.
6. **Review gates / loops**: update who must run, the re-dispatch logic, and the iteration cap. Every loop needs an exit.
7. **Error handling**: decide whether each failure blocks, downgrades to `partial`, or is logged and skipped.
8. **Ownership statements**: search for "Never do X yourself", "Dispatch Y for all Z", "The orchestrator never …" and update them.
9. **Siblings**: consumers read the new artifact by the exact producer path, and previous owners stop doing the moved work.
10. **profile.json**: register any skills the new subagent references (`skill-wiring.md`).
11. **Revision variant**: repeat steps 3–9 for the revision path if it applies.

## Snippets

```markdown
| `new-agent` | Reviewer | Verifies <narrow responsibility>; returns approval-style verdicts |

| `new-agent` | `approved` | Record approval, check other reviewers |
| `new-agent` | `needs-revision` | Re-dispatch `writer-agent` if iteration < 2 |

- Never perform <responsibility> yourself — dispatch `new-agent`

If `{{ artifactDir }}/new-agent/output.md` exists, read it before starting <task>.
```

## Validation

- Reachability: the subagent is in frontmatter and the roster, at least one route leads into it, and a route leads out of each result code.
- Ownership: no prompt still claims the moved work, and producer and consumer artifact paths match.
- Loops terminate at a stated cap, and failure paths are explicit.
- Spelling is identical everywhere. `grep -rn "<name>" profiles/<id>/ shared/agent-includes/ shared/skills/` finds no stale or old-owner references.
- Failure smells: nothing dispatches it, a result code has no route, the orchestrator must read `output.md` to decide, or two prompts own the same work.
- Run the verification commands in SKILL.md.
