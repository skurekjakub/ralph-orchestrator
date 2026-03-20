## Documentation Updates — Member Roles

Based on changes in `65412d25da302785ccbca5bf81993079f8819f18` compared to `master`.

Xperience by Kentico introduces **member roles** — a new content access model that extends the existing authentication-based security with role-based restrictions. Content items and pages can now be configured as **Public**, **Secured** (requires authentication), or **Secured with roles** (requires specific member roles). This documentation update covers the full feature across developer guides, API references, business-user instructions, and infrastructure configuration.

### New Documentation

- **[Member roles](developers-and-admins/development/registration-and-authentication/member-roles.md)** — Developer guide covering the three-tier content access model, the `ContentAccessSettings` API, the `HasAccess()` extension method, programmatic role management, and integration with ASP.NET Identity.
- **[Reference — ContentAccessSettings](developers-and-admins/api/content-item-api/reference-content-access-settings.md)** — API reference for the `ContentAccessSettings` sealed class, including factory methods (`Public()`, `Secured()`, `SecuredWithRoles()`), equality operators, null handling, and migration notes from the previous struct-based API.

### Updated Documentation

**Registration and authentication (4 pages)**
- **[Registration and authentication](developers-and-admins/development/registration-and-authentication.md)** — Replaced deprecated `NoOpApplicationRole`/`NoOpApplicationRoleStore` with `ApplicationRole`/`ApplicationRoleStore`, added three-tier content access model overview, and linked to the new member roles page.
- **[Forms authentication](developers-and-admins/development/registration-and-authentication/forms-authentication.md)** — Updated identity registration code samples to use `ApplicationRole` and `ApplicationRoleStore`.
- **[External authentication](developers-and-admins/development/registration-and-authentication/external-authentication.md)** — Updated identity registration code samples to use `ApplicationRole` and `ApplicationRoleStore`.
- **[Add fields to member objects](developers-and-admins/development/registration-and-authentication/add-fields-to-member-objects.md)** — Updated code samples to use `ApplicationRole` and `ApplicationRoleStore`.

**Content retrieval (2 pages)**
- **[Retrieve content items](developers-and-admins/development/content-retrieval/retrieve-content-items.md)** — Rewrote the content item security section from binary secured/unsecured to the three-tier model, documented `ContentItemRequiredMemberRoleNames`, and added `HasAccess()` code sample.
- **[Retrieve page content](developers-and-admins/development/content-retrieval/retrieve-page-content.md)** — Updated page security configuration for the three-tier access model, documented the `HasAccess()` extension, explained the 401 vs 403 distinction, and updated `AccessDeniedPath` guidance.

**API references (2 pages)**
- **[Reference — Content item query](developers-and-admins/api/content-item-api/reference-content-item-query.md)** — Added `ContentItemRequiredMemberRoleNames` property documentation and code example.
- **[Content item query API](developers-and-admins/api/content-item-api/content-item-query-api.md)** — Added section on security-related query results and `IncludeSecuredItems` behavior with roles.

**Business-user guides (3 pages)**
- **[Members](business-users/members.md)** — Added member roles section covering how to create roles, assign members, and manage role-based access.
- **[Secure pages](business-users/website-content/secure-pages.md)** — Updated Security tab instructions for role-based options, documented the role selection UI, and explained the three-tier model in business terms.
- **[Content items](business-users/content-hub/content-items.md)** — Updated secure content items section with role-based security options and role restriction settings.

**Events and customization (2 pages)**
- **[Reference — Global system events](developers-and-admins/customization/handle-global-events/reference-global-system-events.md)** — Updated `ContentItemEvents` and `WebPageEvents` sections for `AccessSettings` null validation and the three-tier model.
- **[Handle global events](developers-and-admins/customization/handle-global-events.md)** — Updated event handler examples to use `ContentAccessSettings`.

**Infrastructure (2 pages)**
- **[Reference — CI/CD object types](developers-and-admins/ci-cd/reference-ci-cd-object-types.md)** — Added member role object types (`cms.memberrole`, `cms.memberrolemember`, `cms.contentitemmemberrole`).
- **[Content sync configuration](developers-and-admins/configuration/content-sync-configuration.md)** — Documented that member role bindings and `ContentAccessSettings` are included in content sync.

### Cross-Reference Updates

- Added 3 new cross-references linking `ContentAccessSettings` mentions to the new API reference page.
- Verified 477 outbound links across all modified pages — 0 broken references found.

### Known Follow-Up Items

Gap analysis identified 5 items for future follow-up (0 critical, 0 high priority):

1. **ContentRetriever API description** (medium) — The `IncludeSecuredItems` description on the ContentRetriever API page should mention role-based access alongside authentication.
2. **Content API index page** (medium) — The Content item API overview does not yet list the new ContentAccessSettings reference page in its index.
3. **ContentRetriever API reference** (low) — The reference-style `IncludeSecuredItems` entry could be expanded to mention the three-tier access model.
4. **`GetMemberRoleDisplayNames` method** (low) — One method on `IContentItemMemberRoleRetriever` is not yet included in the member roles code sample.
5. **Training guides** (low, out of scope) — Guides in the `_guides` collection reference deprecated `NoOpApplicationRole` and the binary security model; these are outside this pipeline's content scope.

### Pipeline Metrics

| Metric | Value |
|---|---|
| Tasks completed | 17 / 17 |
| New pages created | 2 |
| Existing pages updated | 15 |
| Source code change areas analyzed | 32 |
| Documentation impacts mapped | 22 |
| Review cycles | 33 (avg 1.9 attempts per task) |
| Cross-references verified | 477 |
| Cross-references added | 3 |
| Gap hunting cycles | 1 (converged) |
| Front matter validations passed | 17 / 17 |
| Knowledge entries synthesized | 28 |
