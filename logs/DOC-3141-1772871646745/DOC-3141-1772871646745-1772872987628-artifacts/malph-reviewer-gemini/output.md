## Review: DOC-3141 (ralph.malph — Gemini)

### Build Status (from scout)
- Compile: PASS
- Lint: PASS
- Tests: PASS (452 passing)

### Verdict: APPROVED

All findings are non-blocking suggestions (`SUG-XXX`). The implementation is solid, well-tested, and follows the project's definition-driven architecture correctly.

### Findings

#### src/logic/diagnostics/tags/rules/validateDuplicateAttributes.rule.ts

- **[SUG-001]** Unused import `findTagAttributeNameRange` — imported from `../helpers` on line 3 but never used in the rule body. Only `createTagDiagnostic` is used.
- **Fix:** Remove `findTagAttributeNameRange` from the import: `import { createTagDiagnostic } from '../helpers';`

- **[SUG-003]** The duplicate-detection regex `/\b([\w-]+)\s*(?=\s*=)/gi` (line 30) operates on raw tag text and can match inside quoted attribute values, producing false-positive duplicate warnings. For example, `{% code lang=csharp title="lang=test" %}` would match `lang` twice (once as the real attribute, once inside the `title` value), incorrectly flagging it as duplicated. In practice this is unlikely in KFM content but is a correctness gap.
- **Fix:** Skip over quoted strings before running the regex, or use a more structured parser that tracks quote state. A simple approach: strip quoted values (`"..."` and `'...'`) from `afterTagName` before matching.

#### src/definitions/tags/block/card/diagnostics/imageAttrConflict.ts

- **[SUG-002]** Orphaned dead code — the `validateCardIconImageConflict` function and its file were replaced by the declarative `mutuallyExclusiveWith` approach on `card.types.ts`, but the file itself was not deleted. It is no longer imported anywhere (confirmed by grep). Dead code that should be cleaned up.
- **Fix:** Delete `src/definitions/tags/block/card/diagnostics/imageAttrConflict.ts` and the `diagnostics/` folder if empty.

### Checklist Summary

| Category | Result | Notes |
|---|---|---|
| A. Requirements Coverage | ✅ PASS | All 5 generic rules + dataType on all attrs + declarative properties. No gaps, no scope creep. |
| B. Architecture Compliance | ✅ PASS | Definition-driven pattern followed. Rules in correct location. Proper registration in `rulesRegister.ts`. Card migration from custom rule to declarative `mutuallyExclusiveWith` is clean. |
| C. TypeScript & Code Quality | ✅ PASS | No `any` leakage, proper enum usage, JSDoc on all public APIs. One unused import (SUG-001). |
| D. Validation & Diagnostics | ✅ PASS | All rules follow `TagValidationRuleFn` signature, use `createTagDiagnostic`, skip closing tags. Severities are appropriate (Error for empty required, Warning for others). |
| E. Completions & Decorations | N/A | No changes. |
| F. Grammar (TextMate) | N/A | No changes. |
| G. Testing | ✅ PASS | 340 lines covering all 5 rules with positive/negative/edge cases. Mocha TDD, proper assertions. |

### Summary

This is a well-executed PR that systematically adds 5 new generic validation rules and extends every tag definition with `dataType`. The architecture is sound — the new `mutuallyExclusiveWith` and `dependsOn` declarative properties on `TagAttribute` are a natural extension of the definition-driven pattern. The migration of the card icon/image conflict from a custom rule to the generic declarative approach is clean. Bug fixes (pageLink `false` → `'false'`, cell colspan/rowspan `String` → `Number`, gridItem comment fix) are all correct. Test coverage is comprehensive. The three SUG findings are minor cleanup items that don't affect functionality.
