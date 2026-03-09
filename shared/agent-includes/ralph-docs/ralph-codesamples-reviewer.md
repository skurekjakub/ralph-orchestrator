{% section "codesamples" %}
## Code Samples

The changes include modifications of the codesamples asp.net core project included in the repository at `./src/_code/src`.

Read the **ralph-codesamples** skill for full project structure, feature-folder organization, `code_link` syntax, `//Include:`/`//EndInclude:` markers, and build workflow.

### Review: Code Samples Accuracy

When reviewing changes that involve code samples, verify:

- [ ] **API correctness** — `.cs` files use current, non-deprecated Xperience APIs with correct signatures (cross-reference `resources/repositories/xperience/`)
- [ ] **`code_link` accuracy** — `source` paths in {% raw %}`{% code_link %}`{% endraw %} tags match actual file locations under `src/_code/src/`
- [ ] **Build status** — run `npm run codesamples:build` and confirm it passes
- [ ] **Sample organization** — new files follow feature-folder conventions and namespace patterns (`Codesamples.*`)
  - [ ] Inside each feature folder, files are logically ararnged in subfolders by area of responsibility. For example `Membership/ExternalAuth`, `Membership/Controllers`, `Membership/Models`
- [ ] **Inclusion markers** — `//Include:` / `//EndInclude:` markers correctly wrap the intended code regions
- [ ] **No `Generated/` edits** — auto-generated content type classes must not be manually modified
{% endsection %}
