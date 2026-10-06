# Editing workflow phases

Orchestrators follow numbered phases. A phase is defined in three places, and they must change together, or the agent at runtime follows a table that disagrees with its instructions.

## Anatomy

1. **Workflow table**: `shared/agent-includes/<profile>/*-workflow.md` (e.g. `ralph-docs/ralph-standard-workflow.md`, `ralph-docs/ralph-revision-workflow.md`, `ralph-vscode/malph-review-workflow.md`), rendered into the orchestrator with `{% render %}`. Rows are `| Phase | Reference/Skill | Summary |`.
2. **Phase instructions**, in one of two layouts:
   - **Router skill** (current default; `shared/skills/workflow/docs/ralph-workflow/`, `…/vscode/vscode-workflow/`): one `SKILL.md` with a routing table plus `references/<n>-<name>.md` (standard) and `references/r<n>-<name>.md` (revision).
   - **One skill per phase** (`shared/skills/workflow/docs/malph-workflow-*`, `…/vscode/malph-vscode-workflow-*`): each `SKILL.md` repeats the phase number in up to five places, listed below.
3. **profile.json**: per-phase skills must be in the stage's `skills`. A router skill needs only its own name.

Per-phase number locations (all must move together):

```
① frontmatter description  "… workflow Phase N. Read this skill when …"
② H1                       "# Phase N: <Name>"
③ Before you begin         "This skill is for Phase N: <Name>"
④ Before you begin         "confirm Phase N-1 (<Prev name>) is complete"
⑤ "## Before moving to Phase N+1" → sets Current Phase + next skill/reference in state.md
```

Router references carry ④ and ⑤ only; the router `SKILL.md` table carries the rest.

## Insert a phase at position N

1. Map everything: `ls shared/agent-includes/<profile>/ shared/skills/workflow/<docs|vscode>/` and `grep -rn "Phase [0-9]" shared/skills/workflow/<docs|vscode>/<target>/`.
2. Create the phase (a new `references/<N>-<name>.md` or a new `SKILL.md`) using the shape of its neighbours: read `state.md` → confirm Phase N-1 → instructions → "Before moving to Phase N+1" (set Current Phase, list the next skill/reference, keep the `⚠️ STOP — Read every skill listed above` reminder, append to Completed Phases).
3. Insert the row in every affected workflow table **and** the router `SKILL.md` table.
4. Repoint the predecessor's ⑤ at the new phase, and the new phase's ⑤ at the old N.
5. Increment every number in all five locations for each downstream phase, including the parenthesised names in ④. Renaming reference files (`3-write.md` → `4-write.md`) means updating the tables too.
6. Repeat for the revision workflow if the phase applies there (it keeps its `r` prefix and its own numbering).
7. For per-phase layouts, add the new skill to `profile.json`.

**Remove** reverses this: drop the row, delete the file or skill, decrement downstream numbers, repoint the predecessor's ⑤, and remove it from `profile.json`. **Reorder** is a remove plus an insert. Renumber every phase between the source and destination positions.

A skill that only subagents read (not the orchestrator) needs no table row or renumbering. Wire it per `skill-wiring.md`.

## Checklist

- [ ] Tables (agent-include workflow tables + router SKILL.md) match the files, in both standard and revision
- [ ] Every downstream phase is renumbered in all locations, including frontmatter descriptions
- [ ] Predecessor and new phase "Before moving to" point at the right next phase
- [ ] `profile.json` skills updated (per-phase layout)
- [ ] `npx vitest run tests/container/template-integration.test.ts` and then `npm test` pass

Common misses: the revision workflow, phase numbers in frontmatter descriptions, an off-by-one in the predecessor, and stale "(Prev name)" text in ④.
