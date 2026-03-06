---
name: devralph-workflow-commit
description: "Phase 7 of the standard development workflow — final build verification, staging, commit with dev(TASKID) prefix, and push. The final build matters because review-phase fixes may have introduced new issues."
---
{% raw %}

# Phase 7: Commit

## Before you begin

1. **Read `state.md`** — confirm you're in Phase 7.
2. All reviews must be addressed and all tests must pass.

## Instructions

1. **Final build verification:**
   ```bash
   npm run build
   npx gulp rspec_tests
   ```
   Do NOT proceed if the build fails.

2. **Check what's changed:**
   ```bash
   git status
   git diff --stat
   ```

3. **Stage your changes:**
   ```bash
   git add -A
   ```

4. **Verify staged files** — make sure nothing unexpected is staged:
   ```bash
   git diff --cached --stat
   ```

5. **Commit with conventional prefix:**
   ```bash
   git commit -m "dev({{ taskId }}): <concise description of changes>"
   ```
   
   Use sub-messages for detail if needed:
   ```bash
   git commit -m "dev({{ taskId }}): <summary>" -m "- detail 1" -m "- detail 2"
   ```

6. **Push to remote:**
   ```bash
   git push origin HEAD
   ```

## Before moving to Phase 8

Update `state.md`:
- Set "Current Phase" to `Phase 8: PR`
- Set "Skills for this phase" to:
  - devralph-workflow-pr
  - ralph-ado-pr-workflow
- Add Phase 7 to "Completed Phases" with commit hash

{% endraw %}
