# Phase D: Writer + Researcher Handoff Updates

**Repo:** `ralph-orchestrator`
**Depends on:** Phase C (coder must be in the dispatch flow)

## Step 5: Update writer — accept coder artifacts

**File:** `profiles/ralph-docs/agents/ralph.ralph-writer.agent.md`

### Change within `triggerParams.codesamples` conditional block

Add awareness that the codesamples project may already be bootstrapped by the coder:

> **If ralph-coder ran previously (check `.ralph/tasks/{{ taskId }}/artifacts/ralph-coder/status.json`):**
> - The codesamples server is already running at `localhost:666` — do NOT run `setversion` yourself
> - Read `ralph-coder`'s `output.md` for the installed version and any migration notes
> - The database is already seeded with test data (members, customers, orders)
> - Reference the `ralph-codesamples-bootstrap` skill only for troubleshooting if builds fail mid-write
>
> **If ralph-coder did NOT run** (no `xpversion` param — project was pre-bootstrapped externally):
> - Follow existing codesamples workflow (current behavior, no change)

### Key principle

The writer should **never re-run setversion** if the coder already bootstrapped. This avoids:
- Database recreation (loses seeded test data)
- Version conflicts (writer might get a different version)
- Time waste (bootstrap takes 5–10 minutes)

## Step 6: Update researcher — aware of bootstrapped project

**File:** `profiles/ralph-docs/agents/ralph.ralph-researcher.agent.md`

### Change within `triggerParams.codesamples` conditional block

Add awareness of bootstrapped project state:

> **If ralph-coder ran previously:**
> - The codesamples project is already built and running at `localhost:666`
> - Explore the built project at `src/_code/src/CodeSamples/` and `src/_code/src/Website/` for current API surface
> - Read ralph-coder's `output.md` for installed version and any notes about package changes
> - The `Generated/` directory contains current content type classes for the installed version
> - If the task involves admin UI features and the server is running, the admin UI is accessible at `localhost:666/admin`
