# Codesamples Bootstrap + Admin UI for ralph-docs Ralph

## TL;DR

Add a new `ralph-coder` subagent to the ralph-docs workflow that bootstraps the Xperience codesamples .NET project before the researcher runs. Create a `ralph-codesamples-bootstrap` skill from `codelinking.md`. Add `xpversion` and `adminui` trigger params. Update Squid proxy allowlist for ADO NuGet feeds, harden the docs-repo caller scripts that drive `codesamples:setversion`, and ignore generated bootstrap artifacts so setup does not pollute git status. Update orchestrator routing, writer handoff, prompt wiring, and codesamples Liquid partial.

## Architecture

**New workflow** (when `triggerParams.codesamples` + `triggerParams.xpversion`):

```
Setup → Coder (bootstrap) → Research → Write → Review → Commit → PR → Handoff
```

**New trigger params:**

- `xpversion=<semver|private-feed|PR-URL|build-URL>` — passed to `npm run codesamples:setversion`
- `adminui` — enables Playwright admin UI interaction (separate concern)

**Example triggers:**

```
@Ralph(codesamples, xpversion=31.2.0-build1)
@Ralph(codesamples, xpversion=31.1.0-somehash)
@Ralph(codesamples, xpversion=https://dev.azure.com/.../pullrequest/24735, adminui)
@Ralph(codesamples, xpversion=https://dev.azure.com/...?buildId=550290)
```

## Phase Index

| Phase | File | Scope | Repo |
|-------|------|-------|------|
| **0a** | [01-phase-0a-docs-repo-scripts.md](01-phase-0a-docs-repo-scripts.md) | Docs-repo script modifications (caller fix, PAT env var, az CLI → curl, artifact hygiene) | kentico-docs-jekyll |
| **0b** | [02-phase-0b-squid-allowlist.md](02-phase-0b-squid-allowlist.md) | Squid proxy allowlist for ADO NuGet/artifact endpoints | ralph-orchestrator |
| **A** | [03-phase-a-bootstrap-skill.md](03-phase-a-bootstrap-skill.md) | New skill: `ralph-codesamples-bootstrap` | ralph-orchestrator |
| **B** | [04-phase-b-coder-subagent.md](04-phase-b-coder-subagent.md) | New subagent: `ralph-coder` | ralph-orchestrator |
| **C** | [05-phase-c-orchestrator-routing.md](05-phase-c-orchestrator-routing.md) | Orchestrator routing update | ralph-orchestrator |
| **D** | [06-phase-d-handoff-updates.md](06-phase-d-handoff-updates.md) | Writer + researcher handoff updates | ralph-orchestrator |
| **E** | [07-phase-e-codesamples-partial.md](07-phase-e-codesamples-partial.md) | Codesamples Liquid partial update | ralph-orchestrator |
| **F** | [08-phase-f-adminui-skill.md](08-phase-f-adminui-skill.md) | New skill: `ralph-codesamples-adminui` | ralph-orchestrator |
| **G+H** | [09-phase-gh-env-and-docs.md](09-phase-gh-env-and-docs.md) | Env var propagation + trigger param docs + prompt wiring | ralph-orchestrator |

## File Manifest

### Create

- `shared/skills/tasks/ralph-codesamples-bootstrap/SKILL.md` — bootstrap skill (Phase A)
- `shared/skills/tasks/ralph-codesamples-adminui/SKILL.md` — admin UI skill (Phase F)
- `profiles/ralph-docs/agents/ralph.ralph-coder.agent.md` — new subagent (Phase B)

### Modify

- `shared/security/squid.conf` — add ADO NuGet/artifact domains (Phase 0b)
- `profiles/ralph-docs/agents/ralph.ralph.agent.md` — coder dispatch + routing (Phase C)
- `profiles/ralph-docs/agents/ralph.ralph-writer.agent.md` — coder artifact reading (Phase D)
- `profiles/ralph-docs/agents/ralph.ralph-researcher.agent.md` — aware of bootstrapped project (Phase D)
- `shared/agent-includes/ralph-docs/ralph-codesamples.md` — coder role + adminui conditional (Phase E)
- `profiles/ralph-docs/profile.json` — add new skills to array (Phase A, F)
- `src/prompt/prompt.ts` — surface the new trigger params and routing semantics in prompt assembly (Phase G+H)
- `docs/user-guide/trigger-parameters.md` — document `xpversion` and `adminui` usage (Phase G+H)
- `shared/skills/workflow/docs/ralph-workflow-write/SKILL.md` — mention bootstrap-aware codesamples behavior (Phase G+H)
- `shared/skills/workflow/docs/ralph-workflow-revision-fix/SKILL.md` — mention bootstrap-aware revision behavior (Phase G+H)

### External (kentico-docs-jekyll repo)

- `src/_code/scripts/set-version.sh` — caller-side PAT handling contract, license preflight, entrypoint remains single source of truth (Phase 0a)
- `src/_code/scripts/helpers/nuget-config.sh` — PAT from env var (Phase 0a)
- `src/_code/scripts/helpers/download-pr-artefacts.sh` — az CLI → curl + PAT (Phase 0a)
- `.gitignore` — ignore generated bootstrap artifacts (Phase 0a)

## Decisions

| Decision | Rationale |
|----------|-----------|
| **New `ralph-coder` subagent** over extending writer | Bootstrap is a distinct phase with its own error handling, runs before research, has complex retry logic (ci-migrate). Keeps writer context focused on documentation. |
| **`ralph-coder` naming** | Consistent with ralph-vscode's coder pattern, forward-looking for future C# coding tasks. |
| **Separate `adminui` trigger** | API suffices for most cases; admin UI is optional, heavyweight, and a separate concern from code sample writing. |
| **ALL `xpversion` formats** | Docs-repo script change replaces az CLI with PAT-based curl, so semver, private feed, PR URLs, and build URLs all work headless. |
| **Separate admin UI skill** | Verification = front-end routes; admin UI = object management + CI persistence. Different workflows and audiences. |

## Resolved Gaps

| # | Gap | Resolution |
|---|-----|-----------|
| 1 | PAT consumption | `nuget-config.sh` reads PAT via `/dev/tty`. **Docs-repo script change** reads `$ADO_PAT_XPERIENCE` env var first (Phase 0a). |
| 2 | Az CLI auth | `download-pr-artefacts.sh` uses 7 az CLI calls. **All replaced with `curl` + PAT Basic auth** (Phase 0a). |
| 3 | Caller contract | `codesamples:setversion` currently drives the helpers in a way that can still drop the PAT or fail late. **`set-version.sh` becomes the explicit preflight and argument-normalization entrypoint** (Phase 0a). |
| 4 | Server lifecycle | Container-bound process, persists across subagent dispatches. `nohup npm run codesamples:serve &`. |
| 5 | MSSQL sidecar | `db` service already in `profiles/ralph-docs/docker-compose.yml` (MSSQL 2022, healthcheck, persistent volume). |
| 6 | License file | Manual prerequisite for first-time setup, but the scripts now fail early and clearly if `src/_code/license.txt` is missing (Phase 0a). |
| 7 | Generated artifacts | Docs-repo ignore rules absorb bootstrap-generated files so setup does not contaminate working tree state (Phase 0a). |
| 8 | `.devcontainer/.env` | Defaults exist (`Password123!`). Script falls back gracefully. |
| 9 | Squid proxy | ADO NuGet feeds + artifact endpoints added to allowlist first; alternate execution path remains fallback if proxy policy still blocks ADO artifact download (Phase 0b). |

## Verification Checklist

1. `npm run lint` — profile.json and TypeScript remain valid
2. Template rendering dry-run — trigger `@Ralph(codesamples, xpversion=test)` → coder section appears in rendered agents
3. Skills resolve — both new skills exist at paths listed in profile.json
4. Orchestrator routing — coder dispatch is conditional on `codesamples` + `xpversion` (not just `codesamples` alone)
5. Env propagation — `docker compose exec app env | grep ADO_PAT_XPERIENCE` returns value
6. Squid test — `dotnet restore` inside container succeeds with Kentico.Private feed
7. Working tree hygiene — generated `nuget.config`, `.csproj`, local packages, and dev appsettings do not show up as accidental changes after bootstrap
8. End-to-end selector coverage — run one semver or private-feed `xpversion`, one PR URL, and one direct build URL case on test inputs
9. If selector coverage fails only because ADO artifact download cannot traverse proxy, switch to the alternate execution path defined in Phase 0b rather than narrowing `xpversion` support
