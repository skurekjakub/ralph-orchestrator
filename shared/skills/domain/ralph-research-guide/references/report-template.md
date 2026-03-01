# Research Report Template

Template and validation checklist for structuring the researcher's final report.

## Report Template

Structure your report using this exact format:

```markdown
## Research Report: <ISSUE_KEY>

### Task Understanding
<What the issue is asking for, in your own words. Be specific about scope.>

### Prior Knowledge (Ralphchives)
<Findings from searching the archives — prior work on the same component, known gotchas, failed approaches. State "No relevant prior work found" if nothing came up.>

### Existing Documentation
- `path/to/file.md` — <what it currently covers, what's relevant>
- `path/to/sibling.md` — <related page, how it connects>
- **Gaps:** <what's missing from current coverage>
- **Navigation:** <parent pages, sidebar config, where new content fits>

### Source Code Findings
- `Namespace.ClassName` — <what it does, key methods/properties>
- `Namespace.EnumType` — <all enum values with descriptions>
- **Defaults:** <default values for configuration options>
- **Discrepancies:** <where existing docs contradict the source>

### External Documentation
- [Page Title](URL) — <what's relevant, how it applies>
- <Only include if the task involves external APIs or .NET platform concepts>

### Recommended Changes
Tasks split into:
- <CREATE-XXX>
- <UPDATE-XXX>
- <MODIFY-XXX>
- <DELETE-XXX>

### Reference Material
<Exact code snippets, API signatures, enum values, configuration examples — anything the writer will need to copy or reference directly. This section should be copy-pasteable.>

### Risks & Open Questions
- <Ambiguities in the JIRA issue>
- <Things that need human judgment>
- <Areas where the source code was unclear>
```

## Validation Checklist

Before returning your report, verify:

- [ ] **Task Understanding** clearly states what needs to change (not just what the issue says)
- [ ] **Prior Knowledge** section is present (even if "no relevant prior work found")
- [ ] **Existing Documentation** includes file paths, not just descriptions
- [ ] **Source Code Findings** includes actual class names, method signatures, and namespaces — not vague descriptions
- [ ] **Discrepancies** between docs and source are explicitly flagged
- [ ] **Recommended Changes** names specific files to create or modify
- [ ] **Reference Material** contains extractable content the writer can use directly
- [ ] **Negative results** are stated — "searched for X, it doesn't exist" is valuable information
- [ ] All file paths are relative to the repository root
- [ ] Xperience source code paths include the `resources/repositories/xperience/` prefix

## Quality Bar

A good research report means the meta-agent can proceed to writing **without doing additional research**. If the writer would need to search the codebase again to find something you mentioned but didn't extract, your report is incomplete.

**Extract, don't summarize.** Include the actual code snippet, not "the class has several methods for configuration." Include the actual frontmatter, not "the page has standard frontmatter fields."
