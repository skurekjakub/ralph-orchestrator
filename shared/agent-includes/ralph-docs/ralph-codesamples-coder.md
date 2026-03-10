{% section "codesamples" %}
## Codesamples Bootstrap

You are bootstrapping the Xperience by Kentico codesamples project.

Read the `ralph-codesamples-bootstrap` skill for complete step-by-step instructions.

**Your version target:** `{{ triggerParams.xpversion }}`

### Quick reference
- `npm run codesamples:setversion -- {{ triggerParams.xpversion }}` — install target version
- `npm run codesamples:build` — verify build
- `npm run codesamples:serve` — start app temporarily for smoke testing (localhost:666)
- If CI restore fails → `npm run codesamples:setversion -- {{ triggerParams.xpversion }} --ci-migrate`

### Build failures
If the build fails due to API changes in the target version (e.g., obsolete types removed, renamed classes), **fix the compilation errors**. This is bootstrap infrastructure — updating source code to match the target SDK version is expected and required.

### Auth
- NuGet private feed auth via `$ADO_PAT_XPERIENCE` env var (handled automatically by `nuget-config.sh`)
- ADO REST API auth (for PR/build URL formats) via same PAT
{%- if triggerParams.adminui %}

### Admin UI Verification
After the temporary server is running, verify admin UI at `localhost:666/admin`:
- Login: `administrator` / `admin`
- Use `playwright-cli` to navigate and verify
- Read `ralph-codesamples-adminui` skill for interaction patterns
- **Screenshot every key interaction** to `/tmp/mcp-attachments/adminui-NN-description.png`
{%- endif %}
{% endsection %}
