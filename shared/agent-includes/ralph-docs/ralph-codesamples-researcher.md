{% section "codesamples" %}
## Code Samples

This task involves the **code samples project** — a compilable .NET solution at `src/_code/src/` whose code is embedded into documentation pages via {% raw %}`{% code_link %}`{% endraw %} Liquid tags.

Read the **ralph-codesamples** skill for full project structure, feature-folder organization, `code_link` syntax, `//Include:`/`//EndInclude:` markers, and build workflow.

### Research: Code Samples

When researching this task, include a dedicated **Code Samples** section in your research report:

1. **Explore existing samples** — browse `src/_code/src/CodeSamples/` for the feature area related to this task. Note existing files, folder structure, and patterns used.
2. **Find `code_link` usage** — search `src/_documentation/` for existing {% raw %}`{% code_link %}`{% endraw %} tags referencing the same feature area. Understand how samples are currently integrated into documentation pages.
3. **Identify gaps** — based on the JIRA issue requirements, note which code samples need to be created, updated, or removed. List specific file paths and class names where possible.
4. **Check API signatures** — verify the APIs that new samples would demonstrate. Include correct class names, method signatures, and namespaces from the Xperience source code so the writer has accurate references.
5. **Note the `Generated/` folder** — if the task involves content types, check whether `Generated/` classes exist or need regeneration via `npm run codesamples:codegen`.
{% endsection %}
