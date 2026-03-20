# TASK-001: Create new page: Member roles developer guide

## Task Metadata

| Field | Value |
|-------|-------|
| **Task ID** | `TASK-001` |
| **Title** | Create new page: Member roles developer guide |
| **Target Page** | `developers-and-admins/development/registration-and-authentication/member-roles.md` |
| **Action** | `create` |
| **Content Type** | `howto` |
| **Target Personas** | developer |
| **Complexity** | large |
| **Status** | planned |
| **Dependencies** | None |
| **Related Impacts** | `IMP-013` |

## Description

Create a new developer-facing page documenting the member roles system — the three-tier content access model (Public/Secured/SecuredWithRoles), ContentAccessSettings API, HasAccess() extension method, ContentItemRequiredMemberRoleNames, programmatic role management via IContentItemMemberRoleManager and IContentItemMemberRoleRetriever, and integration with ASP.NET Identity (ApplicationRole, ApplicationRoleStore).

## Scope (from Impact Matrix)

### IMP-013: Member roles

- **Type**: `new-page`
- **Priority**: `high`
- **Target Page**: `developers-and-admins/development/registration-and-authentication/member-roles.md`

**Scope details:**

- New page covering: 1
- Introduction to member roles — conceptual overview of the three-tier access model (Public, Secured, SecuredWithRoles). 2
- ContentAccessSettings API — factory methods Public(), Secured(), SecuredWithRoles(roleCodeNames). 3
- HasAccess(
- extension method on IContentItemFieldsSource — code sample for checking access. 4
- ContentItemRequiredMemberRoleNames on query results — code sample. 5
- Programmatic role management via IContentItemMemberRoleManager and IContentItemMemberRoleRetriever. 6
- Integration with ASP.NET Identity — ApplicationRole, ApplicationRoleStore. 7
- Cross-references to business-user pages (Members, Secure pages, Secure content items).

## Sections

### Sections to Add

- Front matter (title, identifier, order, persona)
- Introduction — three-tier content access model overview
- Content access settings — Public(), Secured(), SecuredWithRoles()
- Check content access — HasAccess() extension method
- Query role requirements — ContentItemRequiredMemberRoleNames
- Manage roles programmatically — IContentItemMemberRoleManager, IContentItemMemberRoleRetriever
- ASP.NET Identity integration — ApplicationRole, ApplicationRoleStore
- Next steps

## Code Analysis References

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

### AREA-006: Content Query System

- **Significance**: `high`
- **Summary**: Adds ContentItemRequiredMemberRoleNames property to the IContentQueryDataContainer interface (with a default implementation) and its base/implementation classes. A new ContentItemRolesResultProcessor post-processes query results to populate role names for secured content items, including linked items. This is a significant public API addition enabling developers to check content access requirements directly from query results.

**Public APIs:**
- `IContentQueryDataContainer.ContentItemRequiredMemberRoleNames: IReadOnlyCollection<string> — new property with default interface implementation`
- `ContentQueryDataContainerBase.ContentItemRequiredMemberRoleNames: IReadOnlyCollection<string> — new property`
- **Behavioral Impact**: Developers can now access ContentItemRequiredMemberRoleNames on any content query result container. For secured content items, this returns the code names of member roles required for access (e.g., ['Subscriber', 'Premium_Member']). For unsecured items, returns an empty collection. Works recursively

**Key Concepts:**
- Content query results now automatically include member role names for secured items
- Post-processing pipeline: ContentItemRolesResultProcessor runs after query execution
- Lazy loading: role data only fetched from DB when at least one item has ContentItemIsSecured = true

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

- **AREA-002**: ContentAccessSettings changed from struct to sealed class. Has static factory methods: Public(), Secured(), SecuredWithRoles(IEnumerable<string> roleCodeNames). Now has == and != operators.
- **AREA-006**: IContentQueryDataContainer.ContentItemRequiredMemberRoleNames: IReadOnlyCollection<string> — new property. ContentItemRolesResultProcessor post-processes query results. Lazy loading: role data only fetched when at least one item has ContentItemIsSecured=true.
- **AREA-009**: ContentItemFieldsSourceExtensions.HasAccess(this IContentItemFieldsSource, ClaimsPrincipal) — public extension method for three-tier access check. Returns are Allowed (200), NotAuthenticated (401), Forbidden (403).

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

### INV-structure-003

- **Category**: `structure`
- **Severity**: `must`
- **Source**: `docs-style-guide.md`
- **Rule**: Introduction must answer: What is the primary use case? Why does it benefit me? When should I use it?
- **Context**: Introduction: Requirements.

### INV-structure-010

- **Category**: `structure`
- **Severity**: `should`
- **Source**: `docs-style-guide.md`
- **Rule**: Provide next steps at the end of articles, linking to related articles or additional resources.
- **Context**: Next steps section.

### INV-structure-021

- **Category**: `structure`
- **Severity**: `must`
- **Source**: `guides-style-guide.md`
- **Rule**: Each guide must have a clear type label: Concept, Tutorial, or How-to (following Diataxis framework).
- **Context**: Guide Types.

### INV-frontmatter-001

- **Category**: `frontmatter`
- **Severity**: `must`
- **Source**: `markdown-syntax.md`
- **Rule**: Every page must have YAML front matter between --- lines with required fields: title, identifier, order, redirect_from, persona, license (for _documentation and _guides collections).
- **Context**: Front Matter.

### INV-frontmatter-002

- **Category**: `frontmatter`
- **Severity**: `must`
- **Source**: `markdown-syntax.md`
- **Rule**: Identifier must be snake_case base + collection suffix (_xp for _documentation, _guides for _guides). Must be unique across the whole repo.
- **Context**: Front Matter: Identifier.

### INV-frontmatter-003

- **Category**: `frontmatter`
- **Severity**: `must`
- **Source**: `markdown-syntax.md`
- **Rule**: Order field: start at 100 for new sections; insert by midpoints (550 between 500 and 600).
- **Context**: Front Matter: Order.

### INV-frontmatter-006

- **Category**: `frontmatter`
- **Severity**: `must`
- **Source**: `new-page-creation.md`
- **Rule**: Valid persona values: developer, admin, business, architect, all.
- **Context**: Frontmatter Schema.

### INV-formatting-004

- **Category**: `formatting`
- **Severity**: `must`
- **Source**: `docs-style-guide.md`
- **Rule**: Use backticks for inline code: API members, configuration keys, methods, namespaces, classes, command line tools and arguments.
- **Context**: Code highlighting.

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

### INV-content-030

- **Category**: `content`
- **Severity**: `must`
- **Source**: `word-list.md`
- **Rule**: User types: user = admin account holder; member = registered visitor without admin access; visitor = anonymous website user; contact = Xperience entity for visitors. Do not confuse contact with visitor or customer.
- **Context**: User types and entities.

## Applicable Research Recommendations

### REC-001

- **Topic**: `api-reference`
- **Applicability**: `high`
- **Recommendation**: For each new public class and interface (MemberRoleInfo, ContentAccessSettings, IContentItemMemberRoleRetriever, IContentItemMemberRoleManager), provide a concise first sentence describing the element's purpose without repeating the class name and without saying 'this class does...'. Follow with usage context and a 5-20 line code sample at the top of each reference page.
- **Invariant Gate**: `approved`

### REC-008

- **Topic**: `how-to`
- **Applicability**: `high`
- **Recommendation**: Write membership how-to guides from the user's perspective, addressing real problems: 'Restrict a page to specific member roles' rather than 'Use ContentAccessSettings to set IsSecured.' Each how-to title should state exactly what the guide helps accomplish using imperative mood. Focus on the user's goal (restricting content, managing member roles) with the API as incidental means.
- **Invariant Gate**: `approved`

### REC-009

- **Topic**: `how-to`
- **Applicability**: `high`
- **Recommendation**: For how-to guides addressing membership scenarios (role assignment, content restriction, member authentication), keep each guide focused on a single goal and resist covering every option. A guide on restricting pages to member roles should not also explain how to create custom authentication schemes. Link to related how-tos rather than embedding all related content.
- **Invariant Gate**: `approved`

### REC-012

- **Topic**: `access-control`
- **Applicability**: `high`
- **Recommendation**: For reference documentation of the ContentAccessSettings model and its static factory methods (Public(), Secured(), SecuredWithRoles()), describe each as a neutral, authoritative statement of what the method returns and when to use each variant. Use a comparison table showing the three access modes side by side (columns: method name, IsSecured value, RequiredMemberRoleIDs value, use case).
- **Invariant Gate**: `approved`

### REC-013

- **Topic**: `membership`
- **Applicability**: `high`
- **Recommendation**: Consistently use the established Kentico terminology throughout all membership documentation: 'member' for a registered visitor without admin access, 'visitor' for an anonymous website user, 'user' for an admin account holder. Use 'sign in' (verb) and 'sign-in' (adjective/noun) — never 'log in'. Use 'register' rather than 'sign up' for account creation.
- **Invariant Gate**: `approved`

### REC-014

- **Topic**: `api-reference`
- **Applicability**: `high`
- **Recommendation**: For code examples demonstrating the new membership API, start with the simplest scenario (checking if content is public) and build to complex scenarios (restricting content to specific roles, querying role membership). Each code sample should be preceded by an introductory sentence ending with a colon when immediately preceding the sample. Show expected output as a code comment within the sample.
- **Invariant Gate**: `approved`

### REC-015

- **Topic**: `membership`
- **Applicability**: `high`
- **Recommendation**: When mentioning MemberRoleInfo, ContentAccessSettings, or other new types in prose, always use backtick formatting for the type name and never pluralize the code element directly. Write 'MemberRoleInfo objects' or 'ContentAccessSettings instances' — not 'MemberRoleInfos' or 'ContentAccessSettingss'.
- **Invariant Gate**: `approved`

## Acceptance Criteria

1. Three-tier access model (Public/Secured/SecuredWithRoles) is clearly explained with code examples (INV-structure-002, INV-structure-003)
2. ContentAccessSettings factory methods documented with usage examples (REC-001, REC-012)
3. HasAccess() extension method documented with code sample (REC-014)
4. ContentItemRequiredMemberRoleNames property documented with query example
5. IContentItemMemberRoleManager and IContentItemMemberRoleRetriever interfaces documented (REC-001)
6. ApplicationRole/ApplicationRoleStore integration explained for ASP.NET Identity
7. Correct front matter: unique identifier, order, persona=developer (INV-frontmatter-001, INV-frontmatter-002)
8. Uses backtick formatting for all type names (INV-formatting-004, REC-015)
9. Uses established terminology: member, visitor, user, sign in (INV-content-030, REC-013)
10. Code examples progress from simple to complex (REC-014)
11. How-to focused — addresses user goals not API surface (REC-008, REC-009)
12. Next steps section links to related pages (INV-structure-010)

## Writer Instructions

### Creating a New Page

1. Create a new file at `developers-and-admins/development/registration-and-authentication/member-roles.md`
2. Add YAML front matter with required fields:
   - `title`: Page title
   - `identifier`: Unique snake_case identifier with `_xp` suffix
   - `order`: Use midpoint placement (see existing sibling pages)
   - `redirect_from`: Empty array `[]`
   - `persona`: `developer`
   - `license`: `xp`

### Required Structure (INV-structure-001)

- **Title**: Clear, descriptive page title
- **Introduction**: Context, use cases, value proposition (INV-structure-002, INV-structure-003)
- **Body**: Main content organized into the sections listed above
- **Result**: What the reader achieves
- **Next steps**: Links to related pages (INV-structure-010)

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

Not directly affected by this pattern. No code sample migration needed.
