# TASK-008: Update retrieve page content page

## Task Metadata

| Field | Value |
|-------|-------|
| **Task ID** | `TASK-008` |
| **Title** | Update retrieve page content page |
| **Target Page** | `developers-and-admins/development/content-retrieval/retrieve-page-content.md` |
| **Action** | `update` |
| **Content Type** | `howto` |
| **Target Personas** | developer |
| **Complexity** | medium |
| **Status** | planned |
| **Dependencies** | `TASK-001`, `TASK-002` |
| **Related Impacts** | `IMP-006`, `IMP-016` |

## Description

Consolidated update (IMP-006 + IMP-016): update Page security configuration section for three-tier access model, document HasAccess() extension, update code sample for role-aware access checking, explain 401 vs 403 distinction, update AccessDeniedPath example, and fix stale content.

## Scope (from Impact Matrix)

### IMP-006: Retrieve page content

- **Type**: `update`
- **Priority**: `high`
- **Target Page**: `developers-and-admins/development/content-retrieval/retrieve-page-content.md`

**Scope details:**

- 1)
- Update 'Page security configuration' section to describe three-tier access model. 2
- Document HasAccess(User
- extension method as the recommended programmatic check. 3
- Update code sample to show role-aware access checking. 4
- Explain the distinction between NotAuthenticated (401
- and Forbidden (403
- responses for role-restricted content. 5
- Update AccessDeniedPath example to note it handles both unauthenticated and insufficient-role scenarios.

### IMP-016: Retrieve page content

- **Type**: `stale-fix`
- **Priority**: `high`
- **Target Page**: `developers-and-admins/development/content-retrieval/retrieve-page-content.md`

**Scope details:**

- 1)
- Rephrase description to cover three-tier access model. 2
- Update Razor view code sample to show HasAccess(
- as the recommended check. 3
- Update the 403 explanation to distinguish NotAuthenticated vs Forbidden scenarios. 4
- Mention that AccessDeniedPath now handles both authentication and role-based access denial.

> **Note**: Overlaps with IMP-006; consolidate during writing.

## Sections

### Sections to Modify

- Page security configuration section — rewrite for three-tier model
- Code sample — show role-aware access checking with HasAccess()
- 403 Forbidden explanation — distinguish NotAuthenticated (401) vs Forbidden (403)
- AccessDeniedPath example — note it handles both unauthenticated and insufficient-role scenarios

### Sections to Add

- HasAccess() extension method usage example

## Code Analysis References

### AREA-004: Website Events and Handler Arguments

- **Significance**: `medium`
- **Summary**: Same null validation pattern as AREA-003 applied to 6 website event data state classes (Delete, Move, Publish, Unpublish, UpdateSecuritySettings, UpdateTreePathSlug). Additionally, WebPageMetadata and CreateWebPageParameters gain null validation on their AccessSettings property setters. CreateFolderLanguageVariantEventArgs has a trivial whitespace change. No handler argument signatures changed.

**Breaking Changes:**
- ⚠️ Setting AccessSettings to null on WebPageMetadata (init accessor) or CreateWebPageParameters (set accessor) now throws ArgumentNullException.
- ⚠️ Setting AccessSettings to null on website event data states now throws ArgumentNullException.
- **Behavioral Impact**: Web page creation and update flows now enforce non-null AccessSettings throughout. Developers using CreateWebPageParameters or WebPageMetadata must use ContentAccessSettings.Public() instead of null.

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

### AREA-008: Website Page Management

- **Significance**: `medium`
- **Summary**: Website page management classes mirror the content engine changes: WebPageMetadata and CreateWebPageParameters gain null validation on AccessSettings. CreateFolderParameters also gains null validation. The web page create, delete, and update managers propagate AccessSettings through their flows. WebPageRedirectValidator and WebPageItemRestorer unchanged in this commit.

**Public APIs:**
- `WebPageMetadata.AccessSettings init — now validates non-null`
- `CreateWebPageParameters.AccessSettings set — now validates non-null`
- `CreateFolderParameters.AccessSettings set — now validates non-null`

**Breaking Changes:**
- ⚠️ WebPageMetadata.AccessSettings = null now throws ArgumentNullException
- ⚠️ CreateWebPageParameters.AccessSettings = null now throws ArgumentNullException
- **Behavioral Impact**: Web page creation and update flows enforce non-null AccessSettings values. Developers must explicitly set ContentAccessSettings.Public() for unsecured pages rather than relying on null.

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

- **AREA-006**: ContentItemRequiredMemberRoleNames available on query result containers for role-aware page access checking.
- **AREA-009**: Three-tier: Allowed (200), NotAuthenticated (401), Forbidden (403). Content access cookie auth configuration separates login path from access denied path.

## Applicable Invariants

The content writer MUST satisfy and the reviewers MUST check all of the following invariants:

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

1. Page security configuration describes three-tier model
2. Stale text 'secured to allow access only to authenticated users' replaced
3. HasAccess() documented as recommended programmatic check (REC-014)
4. 401 vs 403 distinction clearly explained
5. AccessDeniedPath covers both unauthenticated and insufficient-role scenarios
6. Code sample shows role-aware access checking
7. Cross-references to member roles page and ContentAccessSettings reference

## Writer Instructions

### Updating an Existing Page

1. Open `developers-and-admins/development/content-retrieval/retrieve-page-content.md`
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
