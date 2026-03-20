# TASK-003: Update registration and authentication page

## Task Metadata

| Field | Value |
|-------|-------|
| **Task ID** | `TASK-003` |
| **Title** | Update registration and authentication page |
| **Target Page** | `developers-and-admins/development/registration-and-authentication.md` |
| **Action** | `update` |
| **Content Type** | `howto` |
| **Target Personas** | developer, admin |
| **Complexity** | large |
| **Status** | planned |
| **Dependencies** | `TASK-001` |
| **Related Impacts** | `IMP-001` |

## Description

Major update to the registration and authentication page: replace NoOpApplicationRole/NoOpApplicationRoleStore references with ApplicationRole/ApplicationRoleStore, update code samples, add three-tier content access model section, update architecture section for role stores, and add cross-references to new member roles page.

## Scope (from Impact Matrix)

### IMP-001: Registration and authentication

- **Type**: `update`
- **Priority**: `critical`
- **Target Page**: `developers-and-admins/development/registration-and-authentication.md`

**Scope details:**

- 1)
- Remove/rewrite the bullet point about NoOpApplicationRole/NoOpApplicationRoleStore (line 35). Replace with explanation of ApplicationRole and ApplicationRoleStore for member role management. 2
- Update the AddIdentity<ApplicationUser, NoOpApplicationRole> code snippet (line 116
- to use ApplicationRole. 3
- Add a new section or subsection explaining the three-tier content access model (Public / Secured / SecuredWithRoles). 4
- Update the 'Xperience ASP.NET Identity architecture' section to mention role stores. 5
- Update 'Configure registration and authentication' to include role-related service registration. 6
- Add cross-reference to new member roles page(s).

## Sections

### Sections to Modify

- NoOpApplicationRole/NoOpApplicationRoleStore bullet point (rewrite)
- AddIdentity<ApplicationUser, NoOpApplicationRole> code snippet
- Xperience ASP.NET Identity architecture section
- Configure registration and authentication section

### Sections to Add

- Three-tier content access model subsection or callout
- Cross-reference to member roles page

## Code Analysis References

### AREA-001: Membership Core

- **Significance**: `medium`
- **Summary**: Deletes the internal ClaimsPrincipalIdentityHelper class and inlines its logic into ClaimsPrincipalExtensions.GetAdminIdentity() and several other call sites. This is a refactoring that removes a public (but internal-namespaced) helper class in favor of direct LINQ on ClaimsPrincipal.Identities. MemberRoleInfo and MemberRoleMemberInfo already existed on master and have no diff in this commit.

**Breaking Changes:**
- ⚠️ ClaimsPrincipalIdentityHelper (CMS.Membership.Internal) was deleted. Any code referencing this public static class will fail to compile. Was in Internal namespace, so external breaking risk is low but
- **Behavioral Impact**: No user-visible behavior change. Internal authentication plumbing now uses inline LINQ instead of the removed helper class. The ClaimsPrincipalExtensions.GetAdminIdentity() method produces identical results.

### AREA-002: Content Item Member Role System

- **Significance**: `high`
- **Summary**: The ContentAccessSettings class is refactored from a struct to a sealed class, gaining == and != operators and null-safe Equals(). The ContentItemMemberRoleManager internal implementation is updated to use ContentItemMemberRoleInfo.Provider directly instead of a cached provider field. The core types (ContentAccessSettings, ContentItemMemberRoleInfo, IContentItemMemberRoleManager, IContentItemMemberRoleRetriever) already existed on master; this commit hardens them.

**Public APIs:**
- `ContentAccessSettings: struct → sealed class (type change)`
- `ContentAccessSettings.operator ==(ContentAccessSettings, ContentAccessSettings) — new`
- `ContentAccessSettings.operator !=(ContentAccessSettings, ContentAccessSettings) — new`

**Breaking Changes:**
- ⚠️ ContentAccessSettings changed from struct to sealed class. Code relying on value-type semantics (default(ContentAccessSettings), stack allocation, struct copy behavior) will break. Equality comparison
- **Behavioral Impact**: ContentAccessSettings now has proper reference semantics. The factory methods (Public(), Secured(), SecuredWithRoles()) remain the same. Equality comparison is now null-safe and uses operator overloads. The internal ContentItemMemberRoleManager no longer caches the provider field, accessing ContentI

**Key Concepts:**
- Three-tier content access model: Public (no auth), Secured (any authenticated user), SecuredWithRoles (specific member roles)

### AREA-009: MVC Content Security and Access Control

- **Significance**: `high`
- **Summary**: Contains the public-facing content access check infrastructure. Key public API: ContentItemFieldsSourceExtensions.HasAccess() extension method on IContentItemFieldsSource. Internal infrastructure includes ContentAccessCheckResult enum (Allowed/NotAuthenticated/Forbidden), SecuredContentAccessValidator, MemberAccessHelper, and ContentAccessCookieAuthenticationConfiguration. These files already existed on master; the changes in this commit are to VirtualContextIdentityService (removing ClaimsPrinc

**Public APIs:**
- `ContentItemFieldsSourceExtensions.HasAccess(this IContentItemFieldsSource, ClaimsPrincipal) — public extension method (existed before this commit, no change in this diff)`
- **Behavioral Impact**: VirtualContextIdentityService now uses inline LINQ instead of deleted ClaimsPrincipalIdentityHelper. GetContentItemAssetService removes the ICacheDependencyBuilderFactory dependency and adds a CONTENT_ITEM_PREFIX constant for asset URL handling. The overall content access check system (HasAccess ext

**Key Concepts:**
- Three-tier access check: Allowed (200), NotAuthenticated (401), Forbidden (403)
- Content access cookie auth configuration separates login path from access denied path
- Virtual context identity service adds member role claims for preview/crawler mode

## Doc Facts (for content writer)

- **AREA-001**: ClaimsPrincipalIdentityHelper (CMS.Membership.Internal) was deleted. Inline LINQ replaces it. No public API impact.
- **AREA-002**: ApplicationRole and ApplicationRoleStore replace NoOpApplicationRole and NoOpApplicationRoleStore in identity registration.
- **AREA-009**: Three-tier access check: Allowed (200), NotAuthenticated (401), Forbidden (403). Content access cookie auth configuration separates login path from access denied path.

## Applicable Invariants

The content writer MUST satisfy and the reviewers MUST check all of the following invariants:

### INV-structure-001

- **Category**: `structure`
- **Severity**: `must`
- **Source**: `docs-style-guide.md`
- **Rule**: Every documentation article must contain: Title, Introduction, Body, Result, and Next Steps.
- **Context**: Documentation page structure: Required elements.

### INV-structure-002

- **Category**: `structure`
- **Severity**: `must`
- **Source**: `docs-style-guide.md`
- **Rule**: Write an introduction at the beginning of each article providing context, real-world scenarios, and explaining value to the user.
- **Context**: Introduction section.

### INV-structure-010

- **Category**: `structure`
- **Severity**: `should`
- **Source**: `docs-style-guide.md`
- **Rule**: Provide next steps at the end of articles, linking to related articles or additional resources.
- **Context**: Next steps section.

### INV-formatting-004

- **Category**: `formatting`
- **Severity**: `must`
- **Source**: `docs-style-guide.md`
- **Rule**: Use backticks for inline code: API members, configuration keys, methods, namespaces, classes, command line tools and arguments.
- **Context**: Code highlighting.

### INV-content-030

- **Category**: `content`
- **Severity**: `must`
- **Source**: `word-list.md`
- **Rule**: User types: user = admin account holder; member = registered visitor without admin access; visitor = anonymous website user; contact = Xperience entity for visitors. Do not confuse contact with visitor or customer.
- **Context**: User types and entities.

### INV-persona-003

- **Category**: `persona`
- **Severity**: `must`
- **Source**: `docs-style-guide.md`
- **Rule**: Developers and admins: can combine 2 related easy steps. Use developer terminology appropriately. Explain business/marketing terms when needed.
- **Context**: Target audiences: Developers and admins.

### INV-codesamples-010

- **Category**: `codesamples`
- **Severity**: `should`
- **Source**: `guides-style-guide-full.md`
- **Rule**: Developer guides: break code examples into logical steps/sections. Tutorials need more detailed code; How-tos need less.
- **Context**: Material for developers.

## Applicable Research Recommendations

### REC-013

- **Topic**: `membership`
- **Applicability**: `high`
- **Recommendation**: Consistently use the established Kentico terminology throughout all membership documentation: 'member' for a registered visitor without admin access, 'visitor' for an anonymous website user, 'user' for an admin account holder. Use 'sign in' (verb) and 'sign-in' (adjective/noun) — never 'log in'. Use 'register' rather than 'sign up' for account creation.
- **Invariant Gate**: `approved`

### REC-015

- **Topic**: `membership`
- **Applicability**: `high`
- **Recommendation**: When mentioning MemberRoleInfo, ContentAccessSettings, or other new types in prose, always use backtick formatting for the type name and never pluralize the code element directly. Write 'MemberRoleInfo objects' or 'ContentAccessSettings instances' — not 'MemberRoleInfos' or 'ContentAccessSettingss'.
- **Invariant Gate**: `approved`

### REC-016

- **Topic**: `authentication`
- **Applicability**: `high`
- **Recommendation**: For authentication flow documentation (sign-in, sign-out, ClaimsPrincipal-based identity), describe the authentication pipeline as a sequence of concrete steps the developer configures, not as an abstract architecture explanation. Lead with what the developer needs to do ('Configure the authentication middleware...', 'Register the authentication scheme...') and link to ASP.NET Core external docume
- **Invariant Gate**: `approved`

## Acceptance Criteria

1. All NoOpApplicationRole references replaced with ApplicationRole
2. All NoOpApplicationRoleStore references replaced with ApplicationRoleStore
3. Code samples compile-ready with correct type names (INV-codesamples-010)
4. Three-tier access model mentioned with cross-reference to member roles page
5. Architecture section updated to mention role stores
6. Uses established terminology: member, visitor, user (INV-content-030, REC-013)
7. Authentication pipeline described as concrete steps (REC-016)
8. Next steps updated to include member roles page (INV-structure-010)

## Writer Instructions

### Updating an Existing Page

1. Open `developers-and-admins/development/registration-and-authentication.md`
2. Modify the sections listed above while preserving existing structure
3. Ensure the page remains self-contained (INV-structure-011)
4. Update Next Steps if new cross-references are needed

### Developer/Admin Writing Guidelines

- Can combine 2 related easy steps (INV-persona-003)
- Use developer terminology appropriately
- Backtick all code elements: types, methods, properties, namespaces (INV-formatting-004)
- Never pluralize code element names — use 'X objects' not 'Xs' (REC-015)
- Code examples: break into logical steps/sections (INV-codesamples-010)
- Code examples: progress from simple to complex (REC-014)

### Terminology (INV-content-030, REC-013)

- **member**: registered visitor without admin access
- **visitor**: anonymous website user
- **user**: admin account holder in the Xperience admin UI
- **contact**: Xperience entity for tracking visitor activity
- Use **sign in** (verb) / **sign-in** (adjective/noun) — never 'log in'
- Use **member role** — not 'membership role' or 'user role'

### Shared Pattern: NoOpApplicationRole → ApplicationRole

This task is part of the NoOpApplicationRole → ApplicationRole migration pattern shared across IMP-001 through IMP-004. All authentication code samples must be updated consistently:

- `AddIdentity<ApplicationUser, NoOpApplicationRole>` → `AddIdentity<ApplicationUser, ApplicationRole>`
- `AddRoleStore<NoOpApplicationRoleStore>` → `AddRoleStore<ApplicationRoleStore>`
