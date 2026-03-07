## Review Checklist

You are one of three independent reviewers on a **multi-model review panel**. Each reviewer runs the same checklist but applies independent judgment. Your perspectives will be aggregated by the orchestrator.

### Your model attribution prefix

When posting PR threads, prefix every comment with your agent name in brackets: **[{{ agentName }}]**. This tells the PR author which reviewer flagged each issue.

---

### Input

1. **Read the scout report** at `{{ artifactDir }}/malph-scout/output.md` — it contains the diff summary, pattern checklist, build/lint/test results, missing connections, and focus areas
2. **Read the scout's `status.json`** — check `result` for `build-broken` (if so, note it as an automatic BUILD-001 finding)
3. **Read each changed file in full** — not just the diff. The scout report lists changed files. Read the complete file to understand context.
4. **Read `.github/copilot-instructions.md`** — the project's conventions and architecture

### Review Checklist

Create a TODO list and review each category. Think deeply about each item.

#### A. Requirements Coverage
- [ ] Does the change address what the JIRA issue asked for?
- [ ] Are there gaps — things the issue requested that aren't in the diff?
- [ ] Are there scope creep additions not covered by the issue?

#### B. Architecture Compliance

The extension has **rigid patterns**. Verify they're followed:

- [ ] **Definition-driven pattern** — new tags/attributes use declarative definitions, not ad-hoc logic in providers
- [ ] **TagNames enum** — new tags added to `src/constants.ts` `TagNames` enum (not bare strings)
- [ ] **Definition registration** — new definitions registered in `definitionInit.ts` (tags) or `headerDefinition.ts` (header attrs)
- [ ] **Folder structure** — tag definitions in `src/definitions/tags/<category>/<tag>/`, header in `src/definitions/header/<attr>/`
- [ ] **File naming** — `<tag>.types.ts` for definition, `<tag>Snippet.ts` for snippet provider, `validate*.rule.ts` for rules
- [ ] **Grammar sync** — if a new tag or attribute was added, the TextMate grammar (`grammars/injections/kfmarkdown.json`) was updated to match
- [ ] **Event system** — new VS Code event listeners go through the internal event emitter, not registered ad-hoc
- [ ] **Disposal** — new disposables added to `context.subscriptions` or `pluginDispose.ts`; new timers have `clearAll*` cleanup

#### C. TypeScript & Code Quality

- [ ] **Strict TypeScript** — no `any` type leakage without justification; the project uses `strict: true`
- [ ] **Type interfaces** — `TagDefinition`, `TagAttribute`, `HeaderAttribute` interfaces implemented correctly with all required fields
- [ ] **Enum usage** — `TagNames`, `AttributeDataType`, `Scope`, `DocumentContext` enums used instead of bare strings
- [ ] **Import paths** — no barrel re-exports; direct imports from source modules
- [ ] **No `vscode` namespace misuse** — extension APIs used correctly (disposable management, event subscriptions, configuration reads)
- [ ] **Async correctness** — promises properly awaited; no fire-and-forget in activation path
- [ ] **ESLint compliance** — camelCase/PascalCase naming, semicolons, curly braces, strict equality
- [ ] **JSDoc** — public methods and interfaces have JSDoc documentation

#### D. Validation & Diagnostics

If validation rules were added or modified:

- [ ] **Rule signature** — per-instance rules match `TagValidationRuleFn`, document-level rules match `TagDocumentValidationRuleFn`
- [ ] **Rule registration** — new rules registered in `rulesRegister.ts` (global) or in the tag definition's `validationRules[]`/`documentValidationRules[]`
- [ ] **Diagnostic ranges** — point to the correct text range (tag, attribute, or value — not the whole line)
- [ ] **Severity** — appropriate (`Error` for broken, `Warning` for risky, `Information` for style)
- [ ] **Message clarity** — diagnostic messages are actionable and specific

#### E. Completions & Decorations

If completion providers or decorations were changed:

- [ ] **Snippet correctness** — `$1`, `$2` placeholders are logical; pair tags include {% raw %}`{% endtag %}`{% endraw %}
- [ ] **Attribute `loadSupportedValues`** — async value loaders return the right data and handle empty/error cases
- [ ] **Decoration types** — new types added to `DecorationTypeName` union AND registered in `DecorationManager.initialize()`
- [ ] **Debounce** — decoration updates use the existing debounce pattern (250ms tag, 100ms editor)

#### F. Grammar (TextMate)

If `grammars/injections/kfmarkdown.json` was modified:

- [ ] **Pattern placement** — tags in the correct group (`pair_tag`, `single_tag`, `single_tag_link`, or new `code_blocks` entry)
- [ ] **Scope assignments** — follow existing conventions (`entity.name.tag.other.liquid`, `variable.other`, etc.)
- [ ] **New code languages** — get their own `kfm_code_block_*` entry with proper embedded grammar reference
- [ ] **Regex correctness** — patterns don't over-match or under-match (test against sample KFM content)

#### G. Testing

- [ ] **New utility functions have tests** — pure functions in `_helpers/`, rules, services should have test coverage
- [ ] **Test framework** — uses Mocha (TDD: `suite`/`test`) + `assert` + `sinon`, NOT Jest
- [ ] **Test file location** — in `src/test/` with feature-specific subfolder
- [ ] **No VS Code API mocking** — prefer testing pure functions that don't require the VS Code runtime

---

### Recording findings

For each finding, use issue codes with severity:
- `ARCH-XXX` — Architecture compliance violation (critical)
- `TS-XXX` — TypeScript / code quality issue (critical/major)
- `GRAM-XXX` — TextMate grammar issue (critical)
- `BUILD-XXX` — Build, lint, or test failure (critical)
- `REQ-XXX` — Requirements gap or scope issue (major)
- `SUG-XXX` — Optional suggestion (non-blocking)

**Only report actual findings.** If something passes, do NOT include it.

### Verdict rules

Apply the verdict **mechanically**:

- **`needs-revision`** if ANY `ARCH-XXX`, `TS-XXX`, `GRAM-XXX`, `BUILD-XXX`, or `REQ-XXX` findings exist
- **`approved`** only if the sole remaining findings are `SUG-XXX` or there are no findings at all

`SUG-XXX` is the only non-blocking category.

---

### Posting PR threads

After completing your review, post file-level threads on the ADO pull request:

1. **Get the PR ID** from `{{ artifactDir }}/malph-scout/output.md` (the scout records it)
2. **Post file-level threads** for each finding that targets a specific file and line:
   - Use `ado_create_pull_request_thread` with `threadContext`
   - The `filePath` must be repo-relative starting with `/` (e.g., `/src/definitions/tags/block/code/code.types.ts`)
   - Use `rightFileStart`/`rightFileEnd` line numbers from the **new** (right) side of the diff
   - **Prefix every comment** with `[{{ agentName }}]` — e.g., `**[{{ agentName }}]** ARCH-001: ...`
   - Post one file at a time
3. **Post one general thread** (no `threadContext`) summarizing your verdict: `[{{ agentName }}] Verdict: APPROVED | NEEDS REVISION (N findings)`
4. **If APPROVED** — post the general summary thread only, no file-level threads

---

### Writing delivery artifacts

#### 1. Primary artifact

Write `{{ artifactDir }}/{{ agentName }}/output.md`:

```markdown
## Review: {{ taskId }} ({{ agentName }})

### Build Status (from scout)
- Compile: PASS | FAIL
- Lint: PASS | FAIL
- Tests: PASS | FAIL

### Verdict: APPROVED | NEEDS REVISION

### Findings

#### <file-path>
- **[ARCH-001]** <finding description>
- **Fix:** <exact correction>

### Summary
<Brief overall assessment>
```

#### 2. jira-findings.json

Write `{{ artifactDir }}/{{ agentName }}/jira-findings.json`:

```json
{
  "reviewer": "{{ agentName }}",
  "model": "<your model name>",
  "verdict": "approved | needs-revision",
  "findings": [
    {
      "code": "ARCH-001",
      "severity": "critical",
      "file": "src/path/to/file.ts",
      "line": 42,
      "summary": "Short description",
      "detail": "Full explanation with quotes",
      "correction": "Exact fix"
    }
  ]
}
```

#### 3. status.json and manifest.json

Per the artifact contract.
