# Documentation Update — Member Roles

## Summary

This PR adds comprehensive documentation for the new **member roles** feature in Xperience by Kentico. Member roles extend the existing authentication-based content security with role-based access restrictions, introducing a three-tier content access model: **Public**, **Secured** (requires authentication), and **Secured with roles** (requires specific member roles).

Triggered by code changes in commit `65412d25da302785ccbca5bf81993079f8819f18` compared to `master`.

## Changes

### New Pages (2)

| Page | Identifier | Persona | Description |
|------|------------|---------|-------------|
| [Member roles](src/_documentation/_documentation/developers-and-admins/development/registration-and-authentication/member-roles.md) | `member_roles_xp` | developer | Developer guide covering the three-tier content access model, `ContentAccessSettings` API, `HasAccess()` extension method, programmatic role management, and ASP.NET Identity integration |
| [Reference — ContentAccessSettings](src/_documentation/_documentation/developers-and-admins/api/content-item-api/reference-content-access-settings.md) | `reference_content_access_settings_xp` | developer | API reference for the `ContentAccessSettings` sealed class — factory methods, equality operators, null handling, and migration notes |

### Updated Pages (15)

| Page | Task | Description |
|------|------|-------------|
| [Registration and authentication](src/_documentation/_documentation/developers-and-admins/development/registration-and-authentication.md) | TASK-003 | Replaced deprecated `NoOpApplicationRole`/`NoOpApplicationRoleStore` with `ApplicationRole`/`ApplicationRoleStore`, added three-tier content access model overview |
| [Forms authentication](src/_documentation/_documentation/developers-and-admins/development/registration-and-authentication/forms-authentication.md) | TASK-004 | Updated identity registration code samples to use `ApplicationRole` and `ApplicationRoleStore` |
| [External authentication](src/_documentation/_documentation/developers-and-admins/development/registration-and-authentication/external-authentication.md) | TASK-005 | Updated identity registration code samples to use `ApplicationRole` and `ApplicationRoleStore` |
| [Add fields to member objects](src/_documentation/_documentation/developers-and-admins/development/registration-and-authentication/add-fields-to-member-objects.md) | TASK-006 | Updated code samples to use `ApplicationRole` and `ApplicationRoleStore` |
| [Retrieve content items](src/_documentation/_documentation/developers-and-admins/development/content-retrieval/retrieve-content-items.md) | TASK-007 | Rewrote content item security section for three-tier model, documented `ContentItemRequiredMemberRoleNames` and `HasAccess()` |
| [Retrieve page content](src/_documentation/_documentation/developers-and-admins/development/content-retrieval/retrieve-page-content.md) | TASK-008 | Updated page security for three-tier access model, documented 401 vs 403 distinction and `AccessDeniedPath` guidance |
| [Reference — Content item query](src/_documentation/_documentation/developers-and-admins/api/content-item-api/reference-content-item-query.md) | TASK-009 | Added `ContentItemRequiredMemberRoleNames` property documentation and code example |
| [Content item query API](src/_documentation/_documentation/developers-and-admins/api/content-item-api/content-item-query-api.md) | TASK-010 | Added section on security-related query results and `IncludeSecuredItems` behavior with roles |
| [Members](src/_documentation/_documentation/business-users/members.md) | TASK-011 | Added member roles section — creating roles, assigning members, managing role-based access |
| [Secure pages](src/_documentation/_documentation/business-users/website-content/secure-pages.md) | TASK-012 | Updated Security tab instructions for role-based options, documented role selection UI and three-tier model |
| [Content items](src/_documentation/_documentation/business-users/content-hub/content-items.md) | TASK-013 | Updated secure content items section with role-based security options |
| [Reference — Global system events](src/_documentation/_documentation/developers-and-admins/customization/handle-global-events/reference-global-system-events.md) | TASK-014 | Updated `ContentItemEvents` and `WebPageEvents` for `AccessSettings` null validation |
| [Handle global events](src/_documentation/_documentation/developers-and-admins/customization/handle-global-events.md) | TASK-015 | Updated event handler examples to use `ContentAccessSettings.Public()` |
| [Reference — CI/CD object types](src/_documentation/_documentation/developers-and-admins/ci-cd/reference-ci-cd-object-types.md) | TASK-016 | Added `cms.memberrole`, `cms.memberrolemember`, `cms.contentitemmemberrole` object types |
| [Content sync configuration](src/_documentation/_documentation/developers-and-admins/configuration/content-sync-configuration.md) | TASK-017 | Documented member role bindings and `ContentAccessSettings` in content sync |

### Cross-Reference Updates (3)

- Added `{% page_link reference_content_access_settings_xp %}` on the **Member roles** page where `ContentAccessSettings` is first described
- Converted plain-text `ContentAccessSettings` mention to a page link on the **Registration and authentication** overview page
- Converted plain-text `ContentAccessSettings` mention to a page link on the **Handle global events** page
- Verified 477 outbound links, 112 anchor references, and 99 in-page links — **0 broken**

## Quality Assurance

| Check | Result |
|-------|--------|
| **Style review** | All 17 tasks passed style review (33 review cycles, avg 1.9 attempts/task) |
| **Accuracy review** | All 17 tasks passed accuracy verification against source code |
| **Persona review** | All 17 tasks passed persona targeting validation |
| **Front matter validation** | 17/17 files valid — all identifiers, titles, personas, licenses, and redirect_from fields correct |
| **Cross-references** | 477 outbound links verified, 112 anchor refs verified, 99 in-page links verified — 0 broken, 3 added |
| **Gap analysis** | 1 cycle completed, converged — 0 critical, 0 high, 2 medium, 3 low gaps |

## Known Follow-Up Items

Gap analysis identified 5 items that are outside the scope of this PR:

| ID | Severity | Category | Description |
|----|----------|----------|-------------|
| GAP-001 | medium | stale-content | ContentRetriever API page `IncludeSecuredItems` description should mention role-based access alongside authentication |
| GAP-002 | medium | missing-cross-ref | Content item API overview page does not yet list the new ContentAccessSettings reference page in its index |
| GAP-003 | low | stale-content | ContentRetriever API reference `IncludeSecuredItems` entry could be expanded for three-tier access model |
| GAP-004 | low | acceptance-gap | Member roles page omits `GetMemberRoleDisplayNames(IEnumerable)` method from code sample |
| GAP-005 | low | stale-content | Training guides in `_guides` collection reference deprecated `NoOpApplicationRole` (out of content scope) |

## Pipeline Metrics

| Metric | Value |
|--------|-------|
| Tasks completed | 17/17 (0 blocked) |
| New pages | 2 |
| Updated pages | 15 |
| Lines added | ~1,206 |
| Lines removed | ~57 |
| Source code changes analyzed | 32 |
| Documentation impacts mapped | 22 |
| Total review cycles | 33 (avg 1.9 attempts/task) |
| Cross-references verified | 477 |
| Cross-references added | 3 |
| Gap hunting cycles | 1 (converged) |
| Front matter validations | 17/17 passed |
| Knowledge entries synthesized | 28 |
| Invariants enforced | 213 |

## Review Guidance

Reviewers should pay particular attention to:

1. **New `member-roles.md` page** (TASK-001) — This is the primary new developer guide. Verify the three-tier access model explanation is clear and the code samples are accurate.
2. **New `reference-content-access-settings.md` page** (TASK-002) — API reference with factory methods, equality semantics, and migration notes. Verify completeness against the source `ContentAccessSettings` class.
3. **Content retrieval pages** (TASK-007, TASK-008) — These had the most substantial rewrites, changing the security model explanation from binary to three-tier. Verify the `HasAccess()` examples and 401/403 guidance.
4. **Business-user pages** (TASK-011, TASK-012, TASK-013) — Verify the role-based UI instructions match the actual Xperience admin interface.
5. **`NoOpApplicationRole` → `ApplicationRole` migration** (TASK-003 through TASK-006) — Verify all code samples consistently use the new types.

## Related

- Source commit: `65412d25da302785ccbca5bf81993079f8819f18`
- Base branch: `master`
