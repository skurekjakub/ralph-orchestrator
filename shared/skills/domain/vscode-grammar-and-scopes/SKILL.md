---
name: vscode-grammar-and-scopes
description: Use this skill when working on VS Code TextMate grammars, injection grammars, syntax highlighting, embedded languages, token scopes, fenced code blocks, bracket matching scopes, or when changing files under `grammars/`, `syntaxes/`, or grammar contribution points in `package.json`. Also use when reviewing scope names, `embeddedLanguages`, `tokenTypes`, `injectTo`, `injectionSelector`, or debugging highlighting with the scope inspector.
---

# VS Code Grammar And Scopes

Guidance for changing or reviewing VS Code grammar-based language features.

Use this skill for:
- TextMate grammar files and injection grammars
- Syntax highlighting regressions
- Embedded language behavior inside strings, comments, or fenced blocks
- Bracket matching, comment toggling, or snippet behavior caused by scope changes
- Scope naming and theme compatibility reviews

## Core Model

VS Code grammar highlighting has two layers:
- **TextMate tokenization** decides scopes using regex-based grammar rules
- **Semantic tokens** may add extra highlighting later, but they do not replace a broken grammar

For this repo, grammar work must preserve the extension's definition-driven architecture while also preserving correct editor behavior for KFM tags and embedded content.

## Rules

1. **Prefer existing standard scopes**
   Use common TextMate scopes that themes already understand. Do not invent custom scope names when a standard parent scope already fits.

2. **Treat grammar changes as editor-behavior changes**
   A scope change can affect more than colors. It may change bracket matching, comment behavior, snippet applicability, and embedded-language features.

3. **Keep grammar edits local and explicit**
   Prefer small repository includes and targeted injection selectors over broad regex that changes unrelated text.

4. **Use injection grammars carefully**
   Injection grammars should target the narrowest possible scope using `injectTo` and `injectionSelector`.

5. **Use embedded languages when the editor should switch behavior**
   If embedded content should get its own comments, brackets, snippets, or language features, map it with `embeddedLanguages`.

6. **Reset token content mode for embedded code**
   When embedded code lives inside strings or comments, prefer wrapping it in a `meta.embedded.*` scope. If that is not possible, use `tokenTypes` so VS Code treats it as code instead of string/comment content.

7. **Review unmatched begin/end rules for end-of-file behavior**
   TextMate grammars can leave unmatched regions active until end-of-document. Check that incomplete tags or fences degrade safely.

## What To Check

### Scope design

- Does the most specific scope describe the token accurately?
- Are parent scopes still meaningful for theming?
- Is the change compatible with common theme expectations?
- Did the change accidentally broaden a scope that used to be narrow?

### Injection grammars

- Is `injectTo` limited to the correct host scope?
- Is `injectionSelector` narrow enough to avoid unrelated matches?
- If precedence matters, is left-injection (`L:`) or equivalent behavior chosen intentionally?

### Embedded languages

- Is `embeddedLanguages` configured when embedded content should behave like another language?
- Is a `meta.embedded.*` scope used so bracket matching and commenting work correctly?
- If not, is `tokenTypes` used to reset content mode where needed?

### Brackets and comments

- Should some scopes be excluded from bracket matching with `unbalancedBracketScopes`?
- Did the grammar change accidentally cause bracket pairing inside literal content?
- Does comment toggling still behave correctly in embedded content?

### Repo-specific review points

When the task touches KFM grammar or injections, check:
- `grammars/injections/kfmarkdown.json`
- Any `package.json` grammar contribution points
- Whether custom tags still align with the tag-definition architecture in `src/definitions/`
- Whether a new tag requires both runtime registration and grammar visibility

## Debugging Workflow

When highlighting or scope behavior is wrong:

1. Open the affected token in VS Code
2. Use `Developer: Inspect Editor Tokens and Scopes`
3. Check the most specific scope and parent scopes
4. Confirm whether semantic tokens are also present
5. Verify embedded-language metadata (`language`, `token type`) for nested content
6. Adjust the smallest possible grammar rule

## Planning Guidance

When planning grammar work, separate these concerns if they can be reviewed independently:
- Grammar/injection file edits
- Runtime registration or definition wiring
- Tests for parsing, completions, diagnostics, or decoration behavior
- Manual verification steps using scope inspector or extension host tests

## Reviewer Guidance

Flag changes when they:
- replace standard scopes with repo-specific custom ones without a clear reason
- broaden injection selectors too far
- omit embedded language mapping for content that needs editor semantics
- rely on semantic tokens to cover a broken grammar baseline
- change grammar behavior without corresponding validation of affected editor features

## Output Expectations

When using this skill in implementation or review, explicitly call out:
- which grammar or injection file changed
- which scopes were introduced or modified
- whether embedded language behavior changed
- which user-visible editor behaviors were validated