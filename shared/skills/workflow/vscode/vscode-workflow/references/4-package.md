# Phase 4: Package

## Before you begin

1. **Read `state.md`** at `.ralph/tasks/{{ taskId }}/state.md`
2. **Verify the current phase** — this reference is for the Package phase.
3. **Review completed phases** — confirm the Implement & Review loop is complete and the code is ready.

## Instructions

### Step 1: Bump patch version

Open `package.json` and increment the **patch** version (the third number):

```
1.2.9 → 1.2.10
```

Do not change major or minor versions unless the analyst's plan explicitly says to.

### Step 2: Update CHANGELOG

Open `CHANGELOG.md` and add a new entry **at the top**, right after the title block. Follow the existing format:

```markdown
## [X.Y.Z]

<concise description of what changed — write from the user's perspective, not the developer's>
```

To know what changed, read the coder's `status.json` at `.ralph/tasks/{{ taskId }}/artifacts/ralph-coder/status.json` — use the `changelog_entry` field to write the CHANGELOG entry. The coder includes a user-facing description in this field specifically for CHANGELOG use.

⚠️ **Purity rule:** Do NOT read `ralph-coder/output-v{N}.md` — the orchestrator must only read `status.json` files from subagent artifact directories. The `changelog_entry` field provides the information you need.

Keep it concise — 1-4 bullet points or a short paragraph. Match the tone of existing entries. You may lightly edit the coder's `changelog_entry` text for tone consistency.

### Step 3: Build the .vsix

```bash
npm run build
```

This runs `vsce package --allow-missing-repository` and produces a `.vsix` file in the project root (e.g. `kfm-mdcompletions-X.Y.Z.vsix`).

Verify the `.vsix` file was created and its filename contains the new version number.

### Step 4: Verify

Confirm all three artifacts are ready:
- [ ] `package.json` has the bumped version
- [ ] `CHANGELOG.md` has the new entry at the top
- [ ] `kfm-mdcompletions-X.Y.Z.vsix` exists with the correct version

## Before moving to the next phase

Update `state.md`:
{%- if isRevision %}
- Set "Current Phase" to `Revision Phase 5: Commit & Respond`
- Set "Reference file for this phase" to `references/r5-commit.md`
{%- else %}
- Set "Current Phase" to `Phase 5: Commit & Push`
- Set "Reference file for this phase" to `references/5-commit.md`
{%- endif %}
- Keep the reminder line
- Add the Package phase to "Completed Phases" with the new version number
