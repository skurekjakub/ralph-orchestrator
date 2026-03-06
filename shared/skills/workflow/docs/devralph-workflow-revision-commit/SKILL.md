---
name: devralph-workflow-revision-commit
description: "Phase 3 of the revision workflow — commit revision fixes with fix(TASKID) prefix and push to update the existing PR. No new PR creation needed — the existing one auto-updates with the new commit."
---
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

3. **Push:**
   ```bash
   git push origin HEAD
   ```

4. The existing PR auto-updates with the new commit.

## Before moving to Revision Phase 4

Update `state.md`:
- Set "Current Phase" to `Revision Phase 4: Handoff`
- Set "Skills for this phase" to:
  - devralph-workflow-revision-handoff
- Add Revision Phase 3 to "Completed Phases" with commit hash

{% endraw %}
