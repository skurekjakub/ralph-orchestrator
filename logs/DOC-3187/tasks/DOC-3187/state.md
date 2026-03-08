# Task State: DOC-3187 — Migrate registration and authentication code samples to webapp

## Current Phase
Phase 8: Handoff & Exit

### Skills for this phase
- ralph-workflow-handoff
- ralph-source-references
- ralph-ralphchives

> ⚠️ STOP — Read every skill listed above BEFORE doing any work in this phase.

## Completed Phases
- Phase 1: Setup — Branch `ralph/DOC-3187-migrate-registration-and-authentication-code-samples-to-webapp`, workspace verified, ralphchives searched
- Phase 2: Research — Result: `researched`. Summary: Cataloged ~32 inline code blocks across 4 doc pages, mapped existing AccountController.cs/views for reuse with Include markers, verified all Xperience APIs, found 2 additional NoOpRoleStore doc errors beyond known ApplicationUserManager issue, full implementation plan produced.
- Phase 3: Write — Result: `implemented`. Summary: Migrated ~20 inline code blocks to code_link tags, created 9 new C# files, added markers to 7 existing files, fixed 4 API discrepancies. Codesamples and docs builds pass.
- Phase 4: Review — All three reviewers approved on first pass:
  - Technical: Approved — All API types, markers, behavioral claims verified correct
  - Style: Approved — 3 non-blocking suggestions for minor consistency improvements
  - IA: Approved — Code sample migration preserves navigation, cross-references, and content flow
- Phase 6: Commit & Push — Commit `097437db73`, pushed to remote
- Phase 7: Pull Request — PR #3034: https://dev.azure.com/KenticoCustomerSuccess/CustomerEducation/_git/kentico-docs-jekyll/pullrequest/3034

## Key Decisions
- Reuse existing AccountController.cs with `//Include:` markers to hide ShoppingCartService coupling
- Integrate password reset, email confirmation into core webapp flow (not standalone)
- External auth stays standalone (needs external config like Google)
- Views go under src/Codesamples/Views sorted by convention
- Small Program.cs config snippets (2-5 lines) stay inline
- Namespace: `Codesamples.Membership.Standalone` for standalone samples
- Fix `ApplicationUserManager<TUser>` → `UserManager<TUser>` (2 occurrences)

## Tracked Identifiers
- Branch: ralph/DOC-3187-migrate-registration-and-authentication-code-samples-to-webapp
- Commit: 097437db73
- PR: #3034 — https://dev.azure.com/KenticoCustomerSuccess/CustomerEducation/_git/kentico-docs-jekyll/pullrequest/3034
- Doc pages: registration-and-authentication.md, forms-authentication.md, external-authentication.md, add-fields-to-member-objects.md
- Existing code: AccountController.cs, RegisterViewModel.cs, SignInViewModel.cs, Register.cshtml, SignIn.cshtml

## Source References
(exact source locations backing documentation claims)

## Ralphchives Findings
- DOC-3186 (topic 28): Previous attempt put everything in `Membership/StandaloneSamples/` (19 files). DOC-3187 takes a different approach — integrate into webapp with proper MVC structure, reuse AccountController.cs with Include markers. PR #3033 was the prior result.
- Key insight from DOC-3186: `ApplicationUserManager<TUser>` does not exist in Xperience source — it's standard `UserManager<T>`. AccountController.cs has `ShoppingCartService` dependency.

## Notes
- DOC-3186 created standalone samples; DOC-3187 wants webapp-integrated samples with proper folder structure
- Prior PR #3033 exists — this task supersedes that approach
