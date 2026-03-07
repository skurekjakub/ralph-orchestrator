## Review: DOC-3141 (ralph.malph-reviewer-opus)

### Build Status (from scout)
- Compile: ✅ PASS
- Lint: ✅ PASS
- Tests: ✅ PASS (452 passing)

### Verdict: APPROVED

### Review Summary

This PR adds 5 well-crafted generic tag attribute validation rules, extends the `TagAttribute` interface with two new declarative properties (`mutuallyExclusiveWith`, `dependsOn`), annotates all 27 tag definitions with `dataType`, migrates the card tag's custom icon/image conflict rule to the new declarative pattern, and includes several correctness bugfixes. The implementation follows the extension's definition-driven architecture cleanly.

### Checklist Results

#### A. Requirements Coverage — ✅ PASS
- All 5 generic rules implemented as requested: duplicate attributes, empty required values, positional attribute allowed values, mutually exclusive attributes, attribute dependency
- `dataType` added to all tag definitions across all 27 tags
- New declarative properties (`mutuallyExclusiveWith`, `dependsOn`) on `TagAttribute` interface
- Card's custom `validateCardIconImageConflict` migrated to declarative `mutuallyExclusiveWith`
- Additional correctness fixes: pageLink `suppress_warnings` unquoted boolean, cell colspan/rowspan type correction, gridItem `allowedParents`
- No gaps, no scope creep

#### B. Architecture Compliance — ✅ PASS
- Definition-driven pattern followed throughout — validation is metadata-driven via declarative properties
- Rules registered in `rulesRegister.ts` following existing patterns
- File naming follows `validate*.rule.ts` convention
- Rule files in correct location: `src/logic/diagnostics/tags/rules/`
- No new tags/grammar/disposables needed (N/A categories)

#### C. TypeScript & Code Quality — ✅ PASS
- All new code uses strict TypeScript with proper interfaces
- `TagNames`, `AttributeDataType` enums used correctly (no bare strings)
- Direct imports from source modules (no barrel re-exports)
- All 5 rules have JSDoc documentation
- ESLint passes with `--max-warnings 0`

#### D. Validation & Diagnostics — ✅ PASS
- All rules match `TagValidationRuleFn` signature
- All rules registered in `allTagValidationRules[]` in `rulesRegister.ts`
- Severity appropriate: `Error` for empty required values, `Warning` for everything else
- Diagnostic messages are actionable and include tag name, attribute name, and context
- All rules properly guard with `if (!tagInstance.isOpeningTag) return diagnostics;`
- Duplicate detection uses regex on raw `tagText` (correct — avoids dictionary deduplication)
- Mutually exclusive detection uses alphabetical pair deduplication (correct — avoids double-reporting)

#### E. Completions & Decorations — N/A (no changes)

#### F. Grammar (TextMate) — N/A (no changes)

#### G. Testing — ✅ PASS
- 340 lines of comprehensive tests for all 5 rules
- Uses Mocha (TDD: `suite`/`test`) + `assert` — correct framework
- Located at `src/test/diagnostics/tagAttributeValidation.test.ts` — correct location
- Tests cover: positive detection, negative (no false positives), closing tag skip, edge cases (casing, multiple conflicts, missing dependencies)
- All 452 tests pass

### Findings

#### SUG-001: Orphaned dead code file
- **File:** `src/definitions/tags/block/card/diagnostics/imageAttrConflict.ts`
- **Severity:** suggestion (non-blocking)
- **Description:** This file exports `validateCardIconImageConflict` which is no longer imported anywhere after the card definition was migrated to use the declarative `mutuallyExclusiveWith` pattern. The file is dead code and should be deleted in a cleanup pass.

#### SUG-002: Unused `TagValidationContext` imports
- **Files:** `validateDuplicateAttributes.rule.ts` (line 2), `validateEmptyRequiredAttributeValue.rule.ts` (line 2), `validatePositionalAttributeAllowedValues.rule.ts` (line 2)
- **Severity:** suggestion (non-blocking)
- **Description:** These three rule files import `TagValidationContext` alongside `TagValidationRuleFn`, but only use `TagValidationRuleFn` directly. The `TagValidationContext` type is inferred through the `TagValidationRuleFn` type signature, making the explicit import unnecessary. ESLint doesn't flag this (likely no `@typescript-eslint/no-unused-vars` for type imports), so it's a minor cleanliness item.

### Overall Assessment

This is a high-quality PR that follows the extension's architecture patterns precisely. The five new generic rules are well-designed — they read declarative metadata from tag definitions rather than implementing ad-hoc logic, which is exactly the right pattern for this codebase. The migration of card's custom rule to the declarative approach demonstrates the pattern working in practice. The bugfixes (pageLink unquoted boolean, cell types, gridItem parents) are well-spotted corrections. Test coverage is thorough with 340 lines covering all rules. Both findings are non-blocking suggestions for cleanup.
