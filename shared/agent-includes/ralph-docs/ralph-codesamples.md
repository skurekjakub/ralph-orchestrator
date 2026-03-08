{% section "codesamples" %}
## Code Samples

This task involves the **code samples project** — a compilable .NET solution at `src/_code/src/` whose code is embedded into documentation pages via {% raw %}`{% code_link %}`{% endraw %} Liquid tags.

Read these skills for full project structure, conventions, and workflow:
- **ralph-code-samples** — integration workflow, `code_link` tag syntax, namespace patterns, build commands
- **ralph-codesamples-project** — solution structure (CodeSamples vs Website), feature-folder organization, `//Include:`/`//EndInclude:` markers, standalone samples
{%- if role == 'researcher' %}

### Research: Code Samples

When researching this task, include a dedicated **Code Samples** section in your research report:

1. **Explore existing samples** — browse `src/_code/src/CodeSamples/` for the feature area related to this task. Note existing files, folder structure, and patterns used.
2. **Find `code_link` usage** — search `src/_documentation/` for existing {% raw %}`{% code_link %}`{% endraw %} tags referencing the same feature area. Understand how samples are currently integrated into documentation pages.
3. **Identify gaps** — based on the JIRA issue requirements, note which code samples need to be created, updated, or removed. List specific file paths and class names where possible.
4. **Check API signatures** — verify the APIs that new samples would demonstrate. Include correct class names, method signatures, and namespaces from the Xperience source code so the writer has accurate references.
5. **Note the `Generated/` folder** — if the task involves content types, check whether `Generated/` classes exist or need regeneration via `npm run codesamples:codegen`.
{%- endif %}
{%- if role == 'writer' %}

### Writing: Code Samples Workflow

Follow this sequence when implementing code sample changes:

1. **Read researcher findings** — check the "Code Samples" section in `{{ artifactDir }}/ralph-researcher/output.md` for existing samples, gaps, and API references.
2. **Read existing samples** in the target feature area at `src/_code/src/CodeSamples/` — match namespace patterns (`Codesamples.*`), code style, and directory organization.
3. **Create or update `.cs` files** — follow feature-folder conventions. Use explicit types (not `var`). Add `//Include:` / `//EndInclude:` markers for extractable regions.
4. **Add {% raw %}`{% code_link %}`{% endraw %} tags** in documentation pages — `source` paths are relative to `src/_code/src/`. Each tag needs a unique `id` within the page.
5. **Never edit `Generated/`** — if new content types are needed, run `npm run codesamples:codegen`.
6. **Build**: run `npm run codesamples:build` and fix any compilation errors before returning.
7. **Functional verification** — use the **ralph-codesamples-verification** skill to start the application and exercise the features you implemented. Navigate to the routes, submit forms, trigger controller actions, and confirm the application behaves correctly.
{%- endif %}
{%- if role == 'validator' %}

### Validation: Code Samples Checks

Add these checks to your validation when code samples are involved:

- [ ] **`code_link` paths resolve** — every {% raw %}`{% code_link source="..." %}`{% endraw %} tag's `source` path points to a file that exists under `src/_code/src/`
- [ ] **Build passes** — `npm run codesamples:build` completes without errors
- [ ] **Inclusion markers** — `.cs` files use `//Include:` / `//EndInclude:` markers correctly so the documentation build can extract the right regions
- [ ] **Namespace convention** — new classes follow the `Codesamples.*` namespace pattern
- [ ] **Explicit types** — code samples use explicit types instead of `var`
- [ ] **`Generated/` untouched** — no manual edits to files in the `Generated/` folder
- [ ] **Functional verification** — use the **ralph-codesamples-verification** skill to start the application and verify the implemented features work (routes respond, pages render, forms submit, data flows correctly)
{%- endif %}
{%- if role == 'reviewer' %}

### Review: Code Samples Accuracy

The changes include modifications of the codesamples asp.net core project included in the repository. When reviewing changes that involve code samples, verify:

- [ ] **API correctness** — `.cs` files use current, non-deprecated Xperience APIs with correct signatures (cross-reference `resources/repositories/xperience/`)
- [ ] **`code_link` accuracy** — `source` paths in {% raw %}`{% code_link %}`{% endraw %} tags match actual file locations under `src/_code/src/`
- [ ] **Build status** — run `npm run codesamples:build` and confirm it passes
- [ ] **Sample organization** — new files follow feature-folder conventions and namespace patterns (`Codesamples.*`)
- [ ] **Inclusion markers** — `//Include:` / `//EndInclude:` markers correctly wrap the intended code regions
- [ ] **No `Generated/` edits** — auto-generated content type classes must not be manually modified
{%- endif %}
{% endsection %}
