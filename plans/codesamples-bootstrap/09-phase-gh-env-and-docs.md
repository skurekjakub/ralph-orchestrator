# Phase G+H: Env Var Propagation + Trigger Param Docs

**Repo:** `ralph-orchestrator`
**Depends on:** None (can be done in parallel with other phases)

## Phase G: Env Var Propagation

### Step 10: Verify `ADO_PAT_XPERIENCE` propagation

Already configured — no code changes needed:

| Check | Status | Location |
|-------|--------|----------|
| Docker compose env | ✅ Already defined | `profiles/ralph-docs/docker-compose.yml` → `ADO_PAT_XPERIENCE: "${ADO_PAT_XPERIENCE}"` |
| Env validation | ✅ Already optional | `src/validate/env.ts` |
| `.env` placeholder | ✅ Already present | `.env` (currently empty value) |

### Action required (user/ops — not agent change)

Set the actual value in `.env`:

```env
ADO_PAT_XPERIENCE=<actual-pat-with-build-read-and-packaging-read-scopes>
```

### PAT scope requirements

The PAT needs these scopes on the `kenticoxperience` Azure DevOps organization:

- **Packaging (Read)** — NuGet feed access (`pkgs.dev.azure.com`)
- **Build (Read)** — Pipeline/build queries for PR/build URL formats (`dev.azure.com` REST API)

---

## Phase H: Trigger Param Documentation

### Step 11: Document new trigger params

Update trigger param documentation in the appropriate locations. The documentation should cover:

### New params

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `xpversion` | `string` | When `codesamples` is set and project needs bootstrap | Version or URL to install. Formats: `31.0.0` (semver), `31.1.0-hash` (private feed), PR URL, build URL |
| `adminui` | `boolean` | No | Enables admin UI interaction via Playwright. Coder verifies access; writer can create objects. |

### Usage examples

```
# Stable public version
@Ralph(codesamples, xpversion=31.0.0)

# Pre-release from private feed
@Ralph(codesamples, xpversion=31.2.0-build1)

# From PR artifacts
@Ralph(codesamples, xpversion=https://dev.azure.com/kenticoxperience/CMS/_git/xperience/pullrequest/24735)

# From build artifacts
@Ralph(codesamples, xpversion=https://dev.azure.com/kenticoxperience/CMS/_build/results?buildId=550290)

# With admin UI access
@Ralph(codesamples, xpversion=31.2.0-build1, adminui)

# Codesamples without bootstrap (project pre-configured externally)
@Ralph(codesamples)
```

### Behavioral notes for documentation

- `xpversion` without `codesamples` → ignored (coder only runs when both are present)
- `adminui` without `codesamples` → ignored (admin UI requires running codesamples server)
- `codesamples` without `xpversion` → existing behavior (no coder, writer handles manually)
- `xpversion` value is passed verbatim to `npm run codesamples:setversion --`

### Where to document

- `docs/user-guide/trigger-parameters.md`
- `src/prompt/prompt.ts`
- `shared/skills/workflow/docs/ralph-workflow-write/SKILL.md`
- `shared/skills/workflow/docs/ralph-workflow-revision-fix/SKILL.md`
- JIRA comment instructions if they are maintained elsewhere in the repo
- `docs/agent-templates.md` if trigger params are listed there

### Prompt-wiring expectations

The new params should not exist only in static docs. `src/prompt/prompt.ts` should describe the behavioral semantics clearly enough that the rendered prompt and task metadata agree on:

- `codesamples` plus `xpversion` triggers the coder bootstrap phase
- `codesamples` without `xpversion` preserves the existing manual or pre-bootstrapped path
- `adminui` is additive and only meaningful for codesamples work

### Verification for docs and prompt updates

1. Render a `ralph-docs` task with `codesamples, xpversion=test` and verify the coder-specific guidance appears.
2. Render a `ralph-docs` task with `codesamples` only and verify the legacy no-coder path still appears.
3. Render a task with `codesamples, xpversion=<selector>, adminui` and verify admin UI guidance appears only in the relevant role sections.
4. Confirm the documented examples include all supported selector forms: semver, private-feed version, PR URL, and build URL.
