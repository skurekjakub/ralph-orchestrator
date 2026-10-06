# Consolidating phase skills into a router skill

Every mounted skill costs context, because the agent reads each `SKILL.md`. One router skill with a routing table and per-phase `references/` files costs far less, since the agent reads only the reference for its current phase. `shared/skills/workflow/docs/ralph-workflow/` and `shared/skills/workflow/vscode/vscode-workflow/` are the canonical results. The `malph-*workflow-*` families are still unconsolidated.

## Procedure

1. **Audit** each individual skill: workflow (standard / revision / shared), phase number, Liquid guard, and inner conditionals (`triggerParams.*`, `{% section %}`). Find every reference to the old names: `grep -rn "<old-name>" profiles shared tests docs`.
2. **Create** `shared/skills/workflow/<docs|vscode>/<router-name>/` with `SKILL.md` and `references/`. Name references `<n>-<name>.md` (standard or shared) and `r<n>-<name>.md` (revision), so directory order shows phase order.
3. **Router SKILL.md**: frontmatter saying it is the single entry point, read at the start and at every phase transition. Then one table per workflow, selected with `{%- if isRevision %} … {%- else %} … {%- endif %}`. Then usage: read `state.md`, read the current phase's reference, follow its "Before moving to" section.
4. **Move bodies** into the reference files and guard workflow-specific ones, so a wrong-workflow read explains itself instead of looking broken:

   ```liquid
   {%- unless isRevision %}
   …standard-only instructions…
   {%- else %}
   <!-- This file is for the standard workflow. You are running a revision workflow — this file is intentionally empty. -->
   {%- endunless %}
   ```

   Use the mirror (`{%- if isRevision %}`) for revision-only files. Shared files get no guard. Keep the inner conditionals.

5. **profile.json**: replace the N names with the router name in every variant.
6. **Workflow tables** in `shared/agent-includes/<profile>/`: point rows at `references/<file>` of the router.
7. **Tests**: update fixtures that list the old names, and assert on content absence (`not.toContain("# Phase 1")`) rather than empty output, because guarded files render the HTML comment.
8. **Docs**: `docs/user-guide/skills.md` and any other place that lists the skills.
9. **Delete** the old skill folders, then run `npm test`. Check the router in both standard and revision contexts, and that each reference renders only for its workflow.
