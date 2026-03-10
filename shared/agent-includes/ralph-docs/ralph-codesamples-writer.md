{% section "codesamples" %}
## Code Samples

This task involves the **code samples project** — a compilable .NET solution at `src/_code/src/` whose code is embedded into documentation pages via {% raw %}`{% code_link %}`{% endraw %} Liquid tags.

Read the **ralph-codesamples** skill for full project structure, feature-folder organization, `code_link` syntax, `//Include:`/`//EndInclude:` markers, and build workflow.

### Writing: Code Samples Workflow
{%- if triggerParams.xpversion %}

**Note:** The codesamples project was bootstrapped by ralph-coder. The server is running at localhost:666.
Do NOT run `setversion` — the project is ready to use.
Read `.ralph/tasks/{{ taskId }}/artifacts/ralph-coder/output.md` for version and setup details.
{%- endif %}

Follow this sequence when implementing code sample changes:

1. **Read researcher findings** — check the "Code Samples" section in `{{ artifactDir }}/ralph-researcher/output.md` for existing samples, gaps, and API references.
2. **Read existing samples** in the target feature area at `src/_code/src/CodeSamples/` — match namespace patterns (`Codesamples.*`), code style, and directory organization.
3. **Create or update `.cs` files** — follow feature-folder conventions. Use explicit types (not `var`). Add `//Include:` / `//EndInclude:` markers for extractable regions.
4. **Add {% raw %}`{% code_link %}`{% endraw %} tags** in documentation pages — `source` paths are relative to `src/_code/src/`. Each tag needs a unique `id` within the page.
5. **Never edit `Generated/`** — if new content types are needed, run `npm run codesamples:codegen`.
6. **Codename prefix** — when creating any object in the Xperience database (content types, taxonomies, member roles, etc.), always use `codesamples.` as the codename prefix. In admin UI, expand "Identifiers" and uncheck "Pre-fill code name automatically". Read the **ralph-codesamples** skill § "CI Repository and Object Codenames" for details.
7. **No seeders for CI objects** — do NOT create data seeder classes (`Website/Initialization/SeedersImpl/`) for objects stored in CI (content types, taxonomies, member roles, order statuses, promotions, etc.). CI restores them from XML. Seeders are only for transactional data (members, customers, orders).
8. **Build**: run `npm run codesamples:build` and fix any compilation errors before returning.
9. **Functional verification** — use the **ralph-codesamples-verification** skill to start the application and exercise the features you implemented. Navigate to the routes, submit forms, trigger controller actions, and confirm the application behaves correctly.
{%- if triggerParams.adminui %}

### Admin UI
The admin UI is accessible at `localhost:666/admin` (login: administrator / admin).
Use `playwright-cli` to interact with the admin interface for creating objects.
After creating objects via admin UI, run `npm run codesamples:store` to serialize them to CI XML.
Read the `ralph-codesamples-adminui` skill for object creation workflows.
**Screenshot every key interaction** to `/tmp/mcp-attachments/adminui-NN-description.png` — these are attached to JIRA during handoff.
{%- endif %}
{% endsection %}
