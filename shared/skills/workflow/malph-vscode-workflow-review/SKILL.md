---
name: malph-vscode-workflow-review
description: "VS Code extension review workflow Phase 5. The comprehensive review checklist covering requirements, architecture compliance, TypeScript quality, validation/diagnostics, completions/decorations, grammar, and testing. Every finding must be traced to a specific pattern violation or correctness issue."
---

# Phase 5: Review Against the Extension's Patterns

## Before you begin

1. **Read `state.md`** at `.ralph/tasks/{{ taskId }}/state.md`
2. **Verify the current phase** — this skill is for Phase 5.
3. **Confirm build/lint/test results** from Phase 4 are recorded.

## Instructions

Create a TODO list and perform a comprehensive review. Think deeply about each item.

### A. Requirements Coverage
- [ ] Does the change address what the JIRA issue asked for?
- [ ] Are there gaps — things the issue requested that aren't in the diff?
- [ ] Are there scope creep additions not covered by the issue?

### B. Architecture Compliance

The extension has **rigid patterns**. Verify they're followed:

- [ ] **Definition-driven pattern** — new tags/attributes use declarative definitions, not ad-hoc logic in providers
- [ ] **TagNames enum** — new tags added to `src/constants.ts` `TagNames` enum (not bare strings)
- [ ] **Definition registration** — new definitions registered in `definitionInit.ts` (tags) or `headerDefinition.ts` (header attrs)
- [ ] **Folder structure** — tag definitions in `src/definitions/tags/<category>/<tag>/`, header in `src/definitions/header/<attr>/`
- [ ] **File naming** — `<tag>.types.ts` for definition, `<tag>Snippet.ts` for snippet provider, `validate*.rule.ts` for rules
- [ ] **Grammar sync** — if a new tag or attribute was added, the TextMate grammar (`grammars/injections/kfmarkdown.json`) was updated to match
- [ ] **Event system** — new VS Code event listeners go through the internal event emitter, not registered ad-hoc
- [ ] **Disposal** — new disposables added to `context.subscriptions` or `pluginDispose.ts`; new timers have `clearAll*` cleanup

### C. TypeScript & Code Quality

- [ ] **Strict TypeScript** — no `any` type leakage without justification; the project uses `strict: true`
- [ ] **Type interfaces** — `TagDefinition`, `TagAttribute`, `HeaderAttribute` interfaces implemented correctly with all required fields
- [ ] **Enum usage** — `TagNames`, `AttributeDataType`, `Scope`, `DocumentContext` enums used instead of bare strings
- [ ] **Import paths** — no barrel re-exports; direct imports from source modules
- [ ] **No `vscode` namespace misuse** — extension APIs used correctly (disposable management, event subscriptions, configuration reads)
- [ ] **Async correctness** — promises properly awaited; no fire-and-forget in activation path
- [ ] **ESLint compliance** — camelCase/PascalCase naming, semicolons, curly braces, strict equality
- [ ] **JSDoc** — public methods and interfaces have JSDoc documentation

### D. Validation & Diagnostics

If validation rules were added or modified:

- [ ] **Rule signature** — per-instance rules match `TagValidationRuleFn`, document-level rules match `TagDocumentValidationRuleFn`
- [ ] **Rule registration** — new rules registered in `rulesRegister.ts` (global) or in the tag definition's `validationRules[]`/`documentValidationRules[]`
- [ ] **Diagnostic ranges** — point to the correct text range (tag, attribute, or value — not the whole line)
- [ ] **Severity** — appropriate (`Error` for broken, `Warning` for risky, `Information` for style)
- [ ] **Message clarity** — diagnostic messages are actionable and specific

### E. Completions & Decorations

If completion providers or decorations were changed:

- [ ] **Snippet correctness** — `$1`, `$2` placeholders are logical; pair tags include {% raw %}`{% endtag %}`{% endraw %}
- [ ] **Attribute `loadSupportedValues`** — async value loaders return the right data and handle empty/error cases
- [ ] **Decoration types** — new types added to `DecorationTypeName` union AND registered in `DecorationManager.initialize()`
- [ ] **Debounce** — decoration updates use the existing debounce pattern (250ms tag, 100ms editor)

### F. Grammar (TextMate)

If `grammars/injections/kfmarkdown.json` was modified:

- [ ] **Pattern placement** — tags in the correct group (`pair_tag`, `single_tag`, `single_tag_link`, or new `code_blocks` entry)
- [ ] **Scope assignments** — follow existing conventions (`entity.name.tag.other.liquid`, `variable.other`, etc.)
- [ ] **New code languages** — get their own `kfm_code_block_*` entry with proper embedded grammar reference
- [ ] **Regex correctness** — patterns don't over-match or under-match (test against sample KFM content)

### G. Testing

- [ ] **New utility functions have tests** — pure functions in `_helpers/`, rules, services should have test coverage
- [ ] **Test framework** — uses Mocha (TDD: `suite`/`test`) + `assert` + `sinon`, NOT Jest
- [ ] **Test file location** — in `src/test/` with feature-specific subfolder
- [ ] **No VS Code API mocking** — prefer testing pure functions that don't require the VS Code runtime

## Recording findings

For each finding, record in `state.md` with:
- Issue code: `ARCH-XXX`, `TS-XXX`, `GRAM-XXX`, `BUILD-XXX`, `REQ-XXX`, `SUG-XXX`
- File path and line number
- What's wrong
- Exact correction

**Only report actual findings.** If something passes, do NOT include it. No compliance theater.

## Before moving to Phase 6

Update `state.md`:
- Set "Current Phase" to `Phase 6: Deliver`
- Set "Skills for this phase" to:
  - malph-vscode-workflow-deliver
- Add Phase 5 to "Completed Phases" with finding count by category
