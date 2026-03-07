## Scout Report — DOC-3141

### PR
- PR ID: 2901
- PR URL: https://dev.azure.com/anthropic/kentico-docs/_git/kentico-docs-autocomplete-vscode/pullrequest/2901
- Title: DOC-3141 - Add generic tag attribute validation rules
- Branch: `ralph/doc-3141` → `main`
- Author: Jakub Skurek
- Status: Active (not draft)

### Summary
This PR adds 5 new generic tag attribute validation rules (applied automatically to all tags via `rulesRegister.ts`), extends `TagAttribute` with two new declarative properties (`mutuallyExclusiveWith`, `dependsOn`), adds `dataType` to all attributes across all 27 tag definitions, replaces one custom per-tag validation rule with the generic declarative approach, and includes comprehensive tests (340 lines).

### Changed Files (39 total — 767 insertions, 46 deletions)

| File | Status | Category | Pattern | Notes |
|---|---|---|---|---|
| `.github/copilot-instructions.md` | M | Documentation | Agent instructions | Documents all generic rules, adds registration guidance |
| `CHANGELOG.md` | M | Documentation | Changelog | Version 1.2.8 entry with all changes |
| `kfm-mdcompletions-1.2.8.vsix` | A | Build artifact | VSIX bundle | Pre-built extension package |
| `package.json` | M | Config | Version bump | 1.2.7 → 1.2.8 |
| `src/definitions/tags/types.ts` | M | Core types | TagAttribute interface | Added `mutuallyExclusiveWith?: string[]` and `dependsOn?: string` |
| `src/definitions/tags/admonitions/info/info.types.ts` | M | Tag definition | dataType addition | Added `dataType: Boolean` to icon attr |
| `src/definitions/tags/admonitions/key/key.types.ts` | M | Tag definition | dataType addition | Added `dataType: Boolean` to icon attr |
| `src/definitions/tags/admonitions/license_info/licenseInfo.types.ts` | M | Tag definition | dataType addition | Added `dataType: String` to env, `Boolean` to icon |
| `src/definitions/tags/admonitions/note/note.types.ts` | M | Tag definition | dataType addition | Added `dataType: Boolean` to icon attr |
| `src/definitions/tags/admonitions/tip/tip.types.ts` | M | Tag definition | dataType addition | Added `dataType: Boolean` to icon attr |
| `src/definitions/tags/admonitions/warning/warning.types.ts` | M | Tag definition | dataType addition | Added `dataType: Boolean` to icon attr |
| `src/definitions/tags/assets/arcade/arcade.types.ts` | M | Tag definition | dataType addition | Added `dataType: String` to all 4 attrs |
| `src/definitions/tags/assets/file/file.types.ts` | M | Tag definition | dataType addition | Added `dataType: String` to both attrs |
| `src/definitions/tags/assets/image/image.types.ts` | M | Tag definition | dataType addition | Added types to all 4 attrs (3×String, 1×Boolean) |
| `src/definitions/tags/assets/video/video.types.ts` | M | Tag definition | dataType addition | Added `dataType: String` to all 3 attrs |
| `src/definitions/tags/block/banner/banner.types.ts` | M | Tag definition | dataType addition | Added `dataType: String` to both attrs |
| `src/definitions/tags/block/card/card.types.ts` | M | Tag definition | Declarative migration | Added `dataType`, `mutuallyExclusiveWith` on icon/image; **removed `validationRules` + import of `validateCardIconImageConflict`** |
| `src/definitions/tags/block/code/code.types.ts` | M | Tag definition | dataType addition | Added types to all 4 attrs (String, String, Boolean, String) |
| `src/definitions/tags/block/grid/grid.types.ts` | M | Tag definition | dataType addition | Added `dataType: Number` to cols attr |
| `src/definitions/tags/block/gridItem/gridItem.types.ts` | M | Tag definition | allowedParents + fix | Added `allowedParents: [GRID]`; fixed misleading "table tag" comment |
| `src/definitions/tags/inline/anchor/anchor.types.ts` | M | Tag definition | dataType addition | Added `dataType: String` to identifier |
| `src/definitions/tags/inline/icon/icon.types.ts` | M | Tag definition | dataType addition | Added `dataType: String` to both attrs |
| `src/definitions/tags/inline/status/status.types.ts` | M | Tag definition | dataType addition | Added `dataType: String` to all 3 attrs; cleaned comments |
| `src/definitions/tags/inline/tableOfContents/toc.types.ts` | M | Tag definition | dataType addition | Added `dataType: Number` to minHeadingLevel, maxHeadingLevel |
| `src/definitions/tags/links/buttonLink/buttonLink.types.ts` | M | Tag definition | dataType addition | Added `dataType: String` to all 3 attrs |
| `src/definitions/tags/links/codeLink/codeLink.types.ts` | M | Tag definition | dataType + dependsOn | Added types to all 8 attrs; added `dependsOn: 'source'` to id and exclude |
| `src/definitions/tags/links/externalLink/externalLink.types.ts` | M | Tag definition | dataType addition | Added `dataType: String` to all 3 attrs; cleaned comments |
| `src/definitions/tags/links/inpageLink/inpageLink.types.ts` | M | Tag definition | dataType addition | Added `dataType: String` to both attrs |
| `src/definitions/tags/links/pageLink/pageLink.types.ts` | M | Tag definition | dataType + bugfix | Added types to all 5 attrs; **fixed `values: ['true', false]` → `['true', 'false']`** (unquoted boolean bug) |
| `src/definitions/tags/tables/cell/cell.types.ts` | M | Tag definition | dataType fix | Added `Boolean` to insidelist; **fixed colspan/rowspan from `String` → `Number`** |
| `src/definitions/tags/tables/row/row.types.ts` | M | Tag definition | dataType + mutuallyExclusive | Added `Boolean` types; added `mutuallyExclusiveWith` between header/secondaryHeader |
| `src/definitions/tags/tables/table/table.types.ts` | M | Tag definition | dataType addition | Added `dataType: Boolean` to insidelist |
| `src/logic/diagnostics/tags/rules/validateAttributeDependency.rule.ts` | A | Validation rule | New generic rule | Checks `dependsOn` property; warns if dependency attr missing |
| `src/logic/diagnostics/tags/rules/validateDuplicateAttributes.rule.ts` | A | Validation rule | New generic rule | Detects duplicate attr names via regex on tag text |
| `src/logic/diagnostics/tags/rules/validateEmptyRequiredAttributeValue.rule.ts` | A | Validation rule | New generic rule | Errors on `required` attrs with empty values (named + positional) |
| `src/logic/diagnostics/tags/rules/validateMutuallyExclusiveAttributes.rule.ts` | A | Validation rule | New generic rule | Warns on conflicting attrs via `mutuallyExclusiveWith`; deduplicates pairs |
| `src/logic/diagnostics/tags/rules/validatePositionalAttributeAllowedValues.rule.ts` | A | Validation rule | New generic rule | Validates positional (argv1) values against allowed list |
| `src/logic/diagnostics/tags/rulesRegister.ts` | M | Rule registry | Registration | All 5 new rules imported and registered in `allTagValidationRules[]` |
| `src/test/diagnostics/tagAttributeValidation.test.ts` | A | Tests | New test file | 340 lines covering all 5 rules with positive/negative/edge cases |

### Pattern Checklist

- [x] **TagAttribute interface extended**: `mutuallyExclusiveWith` and `dependsOn` added to `src/definitions/tags/types.ts` (lines 114-124)
- [x] **Rules registered**: All 5 new rules imported and added to `allTagValidationRules[]` in `src/logic/diagnostics/tags/rulesRegister.ts`
- [x] **Rules follow `TagValidationRuleFn` signature**: Each accepts `TagValidationContext`, returns `vscode.Diagnostic[]`
- [x] **Rules use `createTagDiagnostic` helper**: All rules use the standard helper from `../helpers`
- [x] **Rules skip closing tags**: All 5 rules have `if (!tagInstance.isOpeningTag) return diagnostics;` guard
- [x] **Custom rule migrated to declarative**: Card's `validateCardIconImageConflict` replaced by `mutuallyExclusiveWith` on icon/image attributes
- [x] **dataType added to all tag definitions**: All 27 tag definition files updated with appropriate `AttributeDataType` values
- [x] **Version bumped**: 1.2.7 → 1.2.8 in `package.json`
- [x] **CHANGELOG updated**: Full 1.2.8 entry with all changes documented
- [x] **Copilot instructions updated**: Documents all generic rules and registration pattern
- [N/A] **TagNames enum**: No new tags — N/A
- [N/A] **Grammar updated**: No grammar changes — N/A
- [N/A] **Disposal**: No new disposables — N/A

### Build Status
- **Compile**: ✅ PASS — webpack compiled successfully in 5247ms, no errors
- **Lint**: ✅ PASS — ESLint with `--max-warnings 0` passed (TypeScript version warning is cosmetic, not a lint failure)
- **Tests**: ✅ PASS — **452 passing** (861ms), 0 failing

### Notable Observations

1. **Old custom rule file not deleted**: `src/definitions/tags/block/card/diagnostics/imageAttrConflict.ts` still exists on disk and exports `validateCardIconImageConflict`. The import was removed from `card.types.ts` so it's dead code. The file is not in the diff (not deleted). This is harmless (lint passes, no unused import warnings since the file itself isn't imported anywhere) but is orphaned code.

2. **pageLink `suppress_warnings` bugfix**: The `values` array had an unquoted `false` boolean literal (`values: ['true', false]`) which was corrected to `values: ['true', 'false']`. This was a latent type mismatch bug — the `values` field type is `(string | number | boolean)[]` so it compiled, but the validation rule comparison would have failed since `false !== 'false'`.

3. **cell colspan/rowspan dataType fix**: Changed from `AttributeDataType.String` to `AttributeDataType.Number`. The `values` arrays (`[1, 2, 3, 4, 5, 6]`) are number literals, so `Number` is correct.

4. **gridItem `allowedParents`**: Added `allowedParents: [TagNames.GRID]` — this is a correctness improvement (grid_item should only appear inside grid).

5. **codeLink retains `validationRules`**: The codeLink tag still has per-tag `validationRules` for source/section/exclude existence checking. These are content-aware rules that can't be generalized, so this is correct.

6. **Duplicate attribute detection uses regex on raw tag text**: The `validateDuplicateAttributes` rule re-parses the raw tag text rather than relying on `tagInstance.attributes` (which is a dictionary and would lose duplicates). This is the correct approach.

7. **Import of `TagValidationContext` in some rules**: Both `validateDuplicateAttributes` and `validateEmptyRequiredAttributeValue` import `TagValidationContext` but only use `TagValidationRuleFn` from the types. The `context` parameter is typed via `TagValidationRuleFn`, so the `TagValidationContext` import is unused. However, lint passes with `--max-warnings 0`, so TypeScript/ESLint are apparently not flagging this (possibly the type is used for destructuring inference).

### Missing Connections

1. **Orphaned file**: `src/definitions/tags/block/card/diagnostics/imageAttrConflict.ts` is no longer imported anywhere but was not deleted. No functional impact but is dead code.

### Focus Areas for Reviewers

1. **`src/logic/diagnostics/tags/rules/validateDuplicateAttributes.rule.ts`** — Most complex of the 5 new rules. Uses regex-based parsing of raw tag text to find duplicates. Verify the regex `\b([\w-]+)\s*(?=\s*=)` correctly handles all attribute name patterns and edge cases (e.g., attribute values that contain `=`).

2. **`src/logic/diagnostics/tags/rules/validateEmptyRequiredAttributeValue.rule.ts`** — Handles both positional (argv1) and named required attributes. Verify the empty-value check logic for positional attributes and whether `undefined` vs empty string is handled correctly at all call sites.

3. **`src/definitions/tags/types.ts`** — Core interface change adding `mutuallyExclusiveWith` and `dependsOn`. Verify these properties are sufficient for the use cases and whether the types (string[] vs string) are correct for future expansion.

4. **`src/definitions/tags/block/card/card.types.ts`** — Migration from custom `validateCardIconImageConflict` to declarative `mutuallyExclusiveWith`. Verify the diagnostic messages/codes remain consistent or are intentionally changed.

5. **`src/definitions/tags/links/pageLink/pageLink.types.ts`** — Contains the `values: ['true', false]` → `['true', 'false']` bugfix. Verify this is the correct fix and no other tag definitions have similar unquoted boolean values.

6. **`src/definitions/tags/tables/cell/cell.types.ts`** — `colspan`/`rowspan` dataType changed from `String` to `Number`. Verify the existing `validateTagAttributeType` rule handles this correctly with the `values: [1, 2, 3, 4, 5, 6]` number array.

7. **`src/logic/diagnostics/tags/rulesRegister.ts`** — Verify rule ordering is intentional. The new rules are inserted between existing rules.

8. **`src/test/diagnostics/tagAttributeValidation.test.ts`** — 340 lines of tests for all 5 rules. Verify edge case coverage is sufficient (e.g., case sensitivity, whitespace, multiple diagnostics on the same tag).

9. **Orphaned file `src/definitions/tags/block/card/diagnostics/imageAttrConflict.ts`** — Should this be deleted?
