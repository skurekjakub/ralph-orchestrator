{%- if isRevision %}
{% raw %}

# Revision Phase 3: Commit

## Before you begin

1. **Read `state.md`** — confirm you're in Revision Phase 3.
2. All fixes must be implemented and tests passing.

## Instructions

1. **Final verification:**
   ```bash
   npm run build
   npx gulp rspec_tests
   ```

2. **Stage and commit:**
   ```bash
   git add -A
   git diff --cached --stat
   git commit -m "fix({{ taskId }}): address review defects" -m "<details of fixes>"
   ```

3. **Push** with the `ado_push_progress` MCP tool, passing the commit message. The container holds no repository credential, so a plain `push` from the shell fails.

4. The existing PR auto-updates with the new commit.

## Before moving to Revision Phase 4

Update `state.md`:
- Set "Current Phase" to `Revision Phase 4: Handoff`
- Set "Reference file for this phase" to `references/r4-handoff.md`
- Add Revision Phase 3 to "Completed Phases" with commit hash

{% endraw %}
{%- else %}
<!-- This file is for the revision workflow. You are running a standard workflow — this file is intentionally empty. -->
{%- endif %}
