# Baseline: awilix single wiring

Taken in the worktree `.claude/worktrees/awilix-refactor`, branch `refactor/awilix-single-wiring`, at `04dce62` (main after the P6 review fixes). Tree clean apart from the untracked journal files.

| gate | command | exit | result |
|---|---|---|---|
| lint | `npm run lint` | 1 | `tsc` (src, tests, scripts) and `eslint .` pass; the final step, `prettier --check .`, warns on 2 files, both untracked orchestrator scratch under `.superpowers/sdd/plan/` (`progress.md`, `task-0-brief.md`), not part of the repo |
| build | `npm run build` | 0 | `dist/index.js` 355.2kb, no warnings |
| vitest | `npx vitest run` | 0 | 136 files passed, 1974 tests passed |

- **Pre-existing lint finding:** `.superpowers/` is gitignored (`.superpowers/sdd/.gitignore`) but `.prettierignore` does not list it, so prettier checks the scratch files the orchestrator writes there. It is a worktree artefact, not a source defect. Running `prettier --write` on those two files, or listing `.superpowers/` in `.prettierignore`, clears it; neither is done here. Every later gate will show the same two warnings, so compare against this baseline instead of expecting exit 0.
- **Pre-existing warnings in build and vitest:** none. The vitest log carries only the isolation hint.
- **Logs:** `.cache/claude-scratch/awilix/t0-{lint,build,vitest}.log`.
