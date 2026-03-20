# TASK-007: Update retrieve content items page

## Task Metadata

| Field | Value |
|-------|-------|
| **Task ID** | `TASK-007` |
| **Title** | Update retrieve content items page |
| **Target Page** | `developers-and-admins/development/content-retrieval/retrieve-content-items.md` |
| **Action** | `update` |
| **Content Type** | `howto` |
| **Target Personas** | developer |
| **Complexity** | large |
| **Status** | planned |
| **Dependencies** | `TASK-001`, `TASK-002` |
| **Related Impacts** | `IMP-005`, `IMP-015` |

## Description

Consolidated update (IMP-005 + IMP-015): update the Content item security section from binary model to three-tier model, document ContentItemRequiredMemberRoleNames, add HasAccess() code sample, update existing IsAuthenticated check, add projection example, and fix stale content describing items as 'secured to allow access only for authenticated users'.

## Scope (from Impact Matrix)

### IMP-005: Retrieve content items

- **Type**: `update`
- **Priority**: `high`
- **Target Page**: `developers-and-admins/development/content-retrieval/retrieve-content-items.md`

**Scope details:**

- 1)
- Update the 'Content item security' section to describe the three-tier model (public, authenticated-only, role-restricted). 2
- Document ContentItemRequiredMemberRoleNames property available on query result containers. 3
- Add code sample showing HasAccess(User
- extension method as the recommended access check. 4
- Update the existing IsAuthenticated check example to note it only covers binary secured/unsecured — point to HasAccess(
- for role-aware checks. 5
- Add projection example for ContentItemRequiredMemberRoleNames alongside existing ContentItemIsSecured projection.

### IMP-015: Retrieve content items

- **Type**: `stale-fix`
- **Priority**: `high`
- **Target Page**: `developers-and-admins/development/content-retrieval/retrieve-content-items.md`

**Scope details:**

- 1)
- Rephrase 'allow access only for authenticated users' to cover the full three-tier model. 2
- Update the Razor view code sample (lines 285-296
- to show role-aware checking using HasAccess(
- or ContentItemRequiredMemberRoleNames. 3
- Update the projection example (line 306
- to show ContentItemRequiredMemberRoleNames alongside ContentItemIsSecured.

> **Note**: This stale-fix overlaps with IMP-005 update scope; both target the same page section. The content writer should consolidate these.

## Sections

### Sections to Modify

- Content item security section — rewrite for three-tier model
- IsAuthenticated check example — note it only covers binary, point to HasAccess()
- Razor view code sample (lines ~285-296) — show role-aware checking
- Projection example (line ~306) — add ContentItemRequiredMemberRoleNames

### Sections to Add

- HasAccess() extension method code sample
- ContentItemRequiredMemberRoleNames projection example

## Code Analysis References

### AREA-003: Content Engine Events and Handler Arguments

- **Significance**: `medium`
- **Summary**: All 8 content engine event data state classes gain null validation (ArgumentNullException.ThrowIfNull) on the internal setter of the AccessSettings property. This is a defensive hardening change—the AccessSettings property and ContentAccessSettings type already existed. No new properties or event signatures are added. No handler argument files changed in this commit.

**Breaking Changes:**
- ⚠️ Setting AccessSettings to null on any event data state now throws ArgumentNullException. Previously accepted null silently. This is stricter validation, not a signature change.
- **Behavioral Impact**: Event data states for Create, CreateLanguageVariant, Delete, Publish, Unpublish, UpdateDraft, UpdateLanguageMetadata, and UpdateMetadata now enforce non-null AccessSettings. Code in event handlers that sets AccessSettings = null will throw. The default remains ContentAccessSettings.Public().

### AREA-005: Content Item Management

- **Significance**: `medium`
- **Summary**: Content item management classes gain null validation on AccessSettings in parameter and metadata classes. ContentItemCreateManager removes the IDataClassInfoRetriever dependency, using static DataClassInfoProvider instead. ContentItemContainerManager.Create() now accepts an optional ContentAccessSettings parameter (defaults to null, treated as Public internally). ContentItemDeleteManager.FinalizeDeletion() changes so accessSettings defaults to null rather than Public().

**Public APIs:**
- `ContentItemMetadata.AccessSettings init accessor — now validates non-null`
- `CreateContentItemParameters.AccessSettings setter — now validates non-null (both public and internal versions)`

**Breaking Changes:**
- ⚠️ ContentItemMetadata.AccessSettings = null now throws ArgumentNullException
- ⚠️ CreateContentItemParameters.AccessSettings = null now throws ArgumentNullException
- ⚠️ ContentItemCreateManager constructor no longer accepts IDataClassInfoRetriever (internal class, but affects custom DI)
- **Behavioral Impact**: Content item creation and metadata update flows enforce non-null AccessSettings. The container manager now accepts explicit access settings during creation. Deletion flow handles null AccessSettings differently (null means not-populated rather than Public).

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

- **AREA-006**: IContentQueryDataContainer.ContentItemRequiredMemberRoleNames: IReadOnlyCollection<string>. Lazy loading: role data only fetched when at least one item has ContentItemIsSecured=true.
- **AREA-009**: HasAccess(this IContentItemFieldsSource, ClaimsPrincipal) — public extension method. Three-tier: Allowed/NotAuthenticated/Forbidden.

## Applicable Invariants

The content writer MUST satisfy and the reviewers MUST check all of the following invariants:

### INV-structure-001

- **Category**: `structure`
- **Severity**: `must`
- **Source**: `docs-style-guide.md`
- **Rule**: Every documentation article must contain: Title, Introduction, Body, Result, and Next Steps.
- **Context**: Documentation page structure: Required elements.

### INV-structure-006

- **Category**: `structure`
- **Severity**: `must`
- **Source**: `docs-style-guide.md`
- **Rule**: Use ordered lists for step-by-step instructions. Use bullet points when order does not matter.
- **Context**: Body: General guidelines.

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

### INV-persona-003

- **Category**: `persona`
- **Severity**: `must`
- **Source**: `docs-style-guide.md`
- **Rule**: Developers and admins: can combine 2 related easy steps. Use developer terminology appropriately. Explain business/marketing terms when needed.
- **Context**: Target audiences: Developers and admins.

## Applicable Research Recommendations

### REC-001

- **Topic**: `api-reference`
- **Applicability**: `high`
- **Recommendation**: For each new public class and interface (MemberRoleInfo, ContentAccessSettings, IContentItemMemberRoleRetriever, IContentItemMemberRoleManager), provide a concise first sentence describing the element's purpose without repeating the class name and without saying 'this class does...'. Follow with usage context and a 5-20 line code sample at the top of each reference page.
- **Invariant Gate**: `approved`

### REC-012

- **Topic**: `access-control`
- **Applicability**: `high`
- **Recommendation**: For reference documentation of the ContentAccessSettings model and its static factory methods (Public(), Secured(), SecuredWithRoles()), describe each as a neutral, authoritative statement of what the method returns and when to use each variant. Use a comparison table showing the three access modes side by side (columns: method name, IsSecured value, RequiredMemberRoleIDs value, use case).
- **Invariant Gate**: `approved`

### REC-014

- **Topic**: `api-reference`
- **Applicability**: `high`
- **Recommendation**: For code examples demonstrating the new membership API, start with the simplest scenario (checking if content is public) and build to complex scenarios (restricting content to specific roles, querying role membership). Each code sample should be preceded by an introductory sentence ending with a colon when immediately preceding the sample. Show expected output as a code comment within the sample.
- **Invariant Gate**: `approved`

## Acceptance Criteria

1. Content item security section describes three-tier model: public, authenticated-only, role-restricted
2. Stale text 'allow access only for authenticated users' replaced with complete description
3. ContentItemRequiredMemberRoleNames property documented with projection example
4. HasAccess(User) code sample shown as recommended access check (REC-014)
5. Existing IsAuthenticated example updated to note it only covers binary check
6. Code examples progress simple → complex (REC-014)
7. Cross-references to member roles page and ContentAccessSettings reference
8. Developer terminology appropriate (INV-persona-003)

## Writer Instructions

### Updating an Existing Page

1. Open `developers-and-admins/development/content-retrieval/retrieve-content-items.md`
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

Not directly affected by this pattern. No code sample migration needed.
