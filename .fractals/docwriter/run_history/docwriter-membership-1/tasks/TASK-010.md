# TASK-010: Update content item query API page

## Task Metadata

| Field | Value |
|-------|-------|
| **Task ID** | `TASK-010` |
| **Title** | Update content item query API page |
| **Target Page** | `developers-and-admins/api/content-item-api/content-item-query-api.md` |
| **Action** | `update` |
| **Content Type** | `howto` |
| **Target Personas** | developer |
| **Complexity** | small |
| **Status** | planned |
| **Dependencies** | `TASK-009` |
| **Related Impacts** | `IMP-011` |

## Description

Add section about security-related query results, mention ContentItemRequiredMemberRoleNames availability when IncludeSecuredItems is true, cross-reference the reference page.

## Scope (from Impact Matrix)

### IMP-011: Content item query API

- **Type**: `update`
- **Priority**: `high`
- **Target Page**: `developers-and-admins/api/content-item-api/content-item-query-api.md`

**Scope details:**

- 1)
- Add a section or subsection about security-related query results. 2
- Mention that query results include ContentItemRequiredMemberRoleNames when IncludeSecuredItems is true and items are role-restricted. 3
- Cross-reference the reference page for detailed property documentation.

## Sections

### Sections to Add

- Security-related query results section or subsection
- Cross-reference to reference page

## Code Analysis References

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

## Doc Facts (for content writer)

- **AREA-006**: Query results include ContentItemRequiredMemberRoleNames when IncludeSecuredItems is true and items are role-restricted.

## Applicable Invariants

The content writer MUST satisfy and the reviewers MUST check all of the following invariants:

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

## Applicable Research Recommendations

### REC-014

- **Topic**: `api-reference`
- **Applicability**: `high`
- **Recommendation**: For code examples demonstrating the new membership API, start with the simplest scenario (checking if content is public) and build to complex scenarios (restricting content to specific roles, querying role membership). Each code sample should be preceded by an introductory sentence ending with a colon when immediately preceding the sample. Show expected output as a code comment within the sample.
- **Invariant Gate**: `approved`

## Acceptance Criteria

1. Security-related query results section added or integrated
2. ContentItemRequiredMemberRoleNames mentioned with IncludeSecuredItems context
3. Cross-reference to Reference — Content item query page for details
4. Next steps link to role checking guidance (INV-structure-010)
5. Backtick formatting on all code elements (INV-formatting-004)

## Writer Instructions

### Updating an Existing Page

1. Open `developers-and-admins/api/content-item-api/content-item-query-api.md`
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
