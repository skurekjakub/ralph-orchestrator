# Phase E: Codesamples Liquid Partial Update

**Repo:** `ralph-orchestrator`
**Depends on:** Phase B (coder subagent exists)
**File:** `shared/agent-includes/ralph-docs/ralph-codesamples.md`

## Step 7: Add coder role + adminui conditional

### Current state

The shared partial renders conditionally based on `role` parameter (passed when the partial is rendered by each agent template). Existing roles: `researcher`, `writer`, `validator`, `reviewer`.

### Add `role: 'coder'` section

```liquid
{%- if role == 'coder' %}
## Codesamples Bootstrap

You are bootstrapping the Xperience by Kentico codesamples project.

Read the `ralph-codesamples-bootstrap` skill for complete step-by-step instructions.

**Your version target:** `{{ triggerParams.xpversion }}`

### Quick reference
- `npm run codesamples:setversion -- {{ triggerParams.xpversion }}` — install target version
- `npm run codesamples:build` — verify build
- `npm run codesamples:serve` — start dev server (localhost:666)
- If CI restore fails → `npm run codesamples:setversion -- {{ triggerParams.xpversion }} --ci-migrate`

### Auth
- NuGet private feed auth via `$ADO_PAT_XPERIENCE` env var (handled automatically by `nuget-config.sh`)
- ADO REST API auth (for PR/build URL formats) via same PAT

{%- if triggerParams.adminui %}
### Admin UI Verification
After server is running, verify admin UI at `localhost:666/admin`:
- Login: `administrator` / `admin`
- Use `playwright-cli` to navigate and verify
- Read `ralph-codesamples-adminui` skill for interaction patterns
{%- endif %}
{%- endif %}
```

### Add `adminui` conditional to writer role

Within the existing `writer` role section, add:

```liquid
{%- if triggerParams.adminui %}
### Admin UI
The admin UI is accessible at `localhost:666/admin` (login: administrator / admin).
Use `playwright-cli` to interact with the admin interface for creating objects.
After creating objects via admin UI, run `npm run codesamples:store` to serialize them to CI XML.
Read the `ralph-codesamples-adminui` skill for object creation workflows.
{%- endif %}
```

### Update writer role — skip setup if coder ran

Add at the top of the `writer` role section:

```liquid
{%- if triggerParams.xpversion %}
**Note:** The codesamples project was bootstrapped by ralph-coder. The server is running at localhost:666.
Do NOT run `setversion` — the project is ready to use.
Read `.ralph/tasks/{{ taskId }}/artifacts/ralph-coder/output.md` for version and setup details.
{%- endif %}
```
