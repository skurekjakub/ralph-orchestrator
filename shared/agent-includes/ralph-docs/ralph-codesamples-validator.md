{% section "codesamples" %}
## Code Samples

This task involves the **code samples project** — a compilable .NET solution at `src/_code/src/` whose code is embedded into documentation pages via {% raw %}`{% code_link %}`{% endraw %} Liquid tags.

Read the **ralph-codesamples** skill for full project structure, feature-folder organization, `code_link` syntax, `//Include:`/`//EndInclude:` markers, and build workflow.

### Validation: Code Samples Checks

Add these checks to your validation when code samples are involved:

- [ ] **`code_link` paths resolve** — every {% raw %}`{% code_link source="..." %}`{% endraw %} tag's `source` path points to a file that exists under `src/_code/src/`
- [ ] **Build passes** — `npm run codesamples:build` completes without errors
- [ ] **Inclusion markers** — `.cs` files use `//Include:` / `//EndInclude:` markers correctly so the documentation build can extract the right regions
- [ ] **Namespace convention** — new classes follow the `Codesamples.*` namespace pattern
- [ ] **Explicit types** — code samples use explicit types instead of `var`
- [ ] **`Generated/` untouched** — no manual edits to files in the `Generated/` folder
- [ ] **Codename prefix** — any new Xperience database objects must have codenames starting with `codesamples.` (check CI XML files in `CIRepository/`)
- [ ] **No needless seeders** — no data seeder classes for objects stored in CI (content types, taxonomies, member roles, order statuses, promotions)
- [ ] **Functional verification** — use the **ralph-codesamples-verification** skill to start the application and verify the implemented features work (routes respond, pages render, forms submit, data flows correctly)
{% endsection %}
