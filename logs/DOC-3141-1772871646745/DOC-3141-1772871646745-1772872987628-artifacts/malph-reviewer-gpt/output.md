## Review: DOC-3141 (ralph.malph-reviewer-gpt)

### Build Status (from scout)
- Compile: PASS
- Lint: PASS
- Tests: PASS (452 passing)

### Verdict: APPROVED

### Checklist Summary

#### A. Requirements Coverage ✅
- All 5 generic validation rules implemented and registered globally
- `dataType` added to all attributes across all 27 tag definitions
- `mutuallyExclusiveWith` and `dependsOn` declarative properties added to `TagAttribute`
- Card tag migrated from custom rule to declarative approach
- Bugfixes included (pageLink `values: ['true', false]` → `['true', 'false']`, cell colspan/rowspan `String` → `Number`)
- No gaps; no scope creep

#### B. Architecture Compliance ✅
- Definition-driven pattern followed — new rules are data-driven from tag definitions
- New rules follow `TagValidationRuleFn` signature
- All rules registered in `rulesRegister.ts`
- File naming follows `validate*.rule.ts` convention
- Rules placed in correct directory `src/logic/diagnostics/tags/rules/`
- No new tags, grammar changes, event listeners, or disposables needed

#### C. TypeScript & Code Quality ✅
- Strict TypeScript — no `any` leakage
- `TagAttribute` interface properly extended with JSDoc
- `AttributeDataType` enum used consistently (no bare strings)
- Direct imports from source modules (no barrel re-exports)
- Async correctness — no async in new rules
- `TagValidationContext` imported-but-unused pattern matches all existing rules in the codebase (pre-existing convention)

#### D. Validation & Diagnostics ✅
- All 5 rules match `TagValidationRuleFn` signature
- Rules registered in `rulesRegister.ts` `allTagValidationRules[]`
- Diagnostic ranges use `tagInstance.tagRange` (full tag) or `findTagAttributeValueRange` (value-level) — appropriate for each rule
- Severity: `Warning` for most rules, `Error` for empty required values — appropriate
- Messages are actionable and specific
- De-duplication logic in `validateMutuallyExclusiveAttributes` is correct (alphabetical pair key)

#### E. Completions & Decorations — N/A
No changes to completions or decorations.

#### F. Grammar (TextMate) — N/A
No grammar changes.

#### G. Testing ✅
- 340-line test file covering all 5 new rules
- Uses Mocha TDD (`suite`/`test`) + `assert` — correct framework
- Test file in `src/test/diagnostics/` — correct location
- Tests cover positive, negative, and edge cases (case sensitivity, closing tags, multiple diagnostics)
- Helper creates real `vscode.TextDocument` instances for validation context

### Findings

All findings are non-blocking suggestions only.

#### src/logic/diagnostics/tags/rules/validateDuplicateAttributes.rule.ts
- **[SUG-001]** Unused import `findTagAttributeNameRange` at line 3. The rule uses `tagInstance.tagRange` for all diagnostics and never calls this helper.
- **Fix:** Remove `findTagAttributeNameRange` from the import statement.

- **[SUG-002]** The regex `/\b([\w-]+)\s*(?=\s*=)/gi` (line 27) matches attribute-name patterns inside quoted attribute values (e.g., `title="source=test"` would cause `source` to be counted as an extra occurrence, potentially producing a false duplicate warning). In practice, KFM tag values rarely contain `name=value` patterns, but URL query parameters could trigger this.
- **Fix:** Optionally enhance the regex to skip quoted string regions, or document this as a known limitation.

#### src/logic/diagnostics/tags/rules/validateEmptyRequiredAttributeValue.rule.ts
- **[SUG-003]** Inconsistent diagnostic message format between positional and named attributes:
  - Positional (line 28): `Required ${attrDef.name} has an empty value...` (no quotes around name, missing "attribute" word)
  - Named (line 42): `Required attribute '${attrDef.name}' has an empty value...` (with quotes and "attribute" word)
- **Fix:** Align the positional message to: `Required attribute '${attrDef.name}' has an empty value in tag '{% ${tagDefinition.tagName} %}'.`

#### src/definitions/tags/block/card/diagnostics/imageAttrConflict.ts (not in diff)
- **[SUG-004]** Orphaned file. The card tag was migrated to declarative `mutuallyExclusiveWith` and the import was removed from `card.types.ts`, but this file was not deleted. It's dead code with no imports remaining.
- **Fix:** Delete the file and its parent `diagnostics/` directory if now empty.

### Summary

Excellent PR. Five well-structured generic validation rules that follow the established definition-driven architecture. The declarative `mutuallyExclusiveWith` and `dependsOn` properties are clean extensions to `TagAttribute`. The migration from the custom card rule to the declarative approach demonstrates the value of the new pattern. Comprehensive test coverage, all builds passing, and only minor non-blocking suggestions identified.
