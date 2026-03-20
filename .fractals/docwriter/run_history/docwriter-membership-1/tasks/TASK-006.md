# TASK-006: Update add fields to member objects page

## Task Metadata

| Field | Value |
|-------|-------|
| **Task ID** | `TASK-006` |
| **Title** | Update add fields to member objects page |
| **Target Page** | `developers-and-admins/development/registration-and-authentication/add-fields-to-member-objects.md` |
| **Action** | `update` |
| **Content Type** | `howto` |
| **Target Personas** | developer |
| **Complexity** | medium |
| **Status** | planned |
| **Dependencies** | `TASK-003` |
| **Related Impacts** | `IMP-004` |

## Description

Replace NoOpApplicationRole/NoOpApplicationRoleStore with ApplicationRole/ApplicationRoleStore in code samples. Consider adding a remark about ApplicationRole-to-MemberRoleInfo data flow mirroring the ApplicationUser-to-MemberInfo explanation.

## Scope (from Impact Matrix)

### IMP-004: Add fields to member objects

- **Type**: `update`
- **Priority**: `critical`
- **Target Page**: `developers-and-admins/development/registration-and-authentication/add-fields-to-member-objects.md`

**Scope details:**

- 1)
- Replace AddIdentity<ApplicationUser, NoOpApplicationRole> with ApplicationRole in code sample. 2
- Replace AddRoleStore<NoOpApplicationRoleStore> with ApplicationRoleStore. 3
- Consider adding a remark about the ApplicationRole-to-MemberRoleInfo data flow, mirroring the existing ApplicationUser-to-MemberInfo explanation.

## Sections

### Sections to Modify

- AddIdentity code sample (line ~63)
- AddRoleStore code sample (line ~68)
- Remarks — ApplicationUser and MemberInfo section

### Sections to Add

- Remark about ApplicationRole-to-MemberRoleInfo data flow

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

## Doc Facts (for content writer)

- **AREA-001**: NoOpApplicationRole/NoOpApplicationRoleStore replaced.
- **AREA-002**: ApplicationRole maps to MemberRoleInfo similarly to how ApplicationUser maps to MemberInfo.

## Applicable Invariants

The content writer MUST satisfy and the reviewers MUST check all of the following invariants:

### INV-formatting-004

- **Category**: `formatting`
- **Severity**: `must`
- **Source**: `docs-style-guide.md`
- **Rule**: Use backticks for inline code: API members, configuration keys, methods, namespaces, classes, command line tools and arguments.
- **Context**: Code highlighting.

### INV-codesamples-010

- **Category**: `codesamples`
- **Severity**: `should`
- **Source**: `guides-style-guide-full.md`
- **Rule**: Developer guides: break code examples into logical steps/sections. Tutorials need more detailed code; How-tos need less.
- **Context**: Material for developers.

### INV-structure-011

- **Category**: `structure`
- **Severity**: `must`
- **Source**: `docs-style-guide-full.md`
- **Rule**: Articles should be independent of other pages. Exceptions must be properly linked and explained.
- **Context**: Documentation page: should be independent of other pages.

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

## Acceptance Criteria

1. Both code sample locations updated: NoOpApplicationRole → ApplicationRole, NoOpApplicationRoleStore → ApplicationRoleStore
2. ApplicationRole-to-MemberRoleInfo data flow is explained, mirroring existing ApplicationUser-to-MemberInfo pattern
3. Code samples are compile-ready (INV-codesamples-010)
4. Article remains self-contained with proper links (INV-structure-011)
5. Type names in backticks (INV-formatting-004, REC-015)

## Writer Instructions

### Updating an Existing Page

1. Open `developers-and-admins/development/registration-and-authentication/add-fields-to-member-objects.md`
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
