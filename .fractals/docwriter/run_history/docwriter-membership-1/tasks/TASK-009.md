# TASK-009: Update Reference — Content item query page

## Task Metadata

| Field | Value |
|-------|-------|
| **Task ID** | `TASK-009` |
| **Title** | Update Reference — Content item query page |
| **Target Page** | `developers-and-admins/api/content-item-api/reference-content-item-query.md` |
| **Action** | `update` |
| **Content Type** | `reference` |
| **Target Personas** | developer |
| **Complexity** | medium |
| **Status** | planned |
| **Dependencies** | `TASK-002` |
| **Related Impacts** | `IMP-010` |

## Description

Add documentation for ContentItemRequiredMemberRoleNames property in the query result container section, document lazy loading behavior, and add code example.

## Scope (from Impact Matrix)

### IMP-010: Reference - Content item query

- **Type**: `update`
- **Priority**: `high`
- **Target Page**: `developers-and-admins/api/content-item-api/reference-content-item-query.md`

**Scope details:**

- 1)
- Add documentation for ContentItemRequiredMemberRoleNames property in the query result container section. 2
- Document that the property is automatically populated by the ContentItemRolesResultProcessor for secured items. 3
- Add a note explaining the lazy loading behavior (role data only fetched when at least one result has ContentItemIsSecured=true). 4
- Add code example showing how to access ContentItemRequiredMemberRoleNames from query results.

## Sections

### Sections to Modify

- Query result container section — add ContentItemRequiredMemberRoleNames

### Sections to Add

- ContentItemRequiredMemberRoleNames property documentation
- Lazy loading behavior note
- Code example accessing role names from query results

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

- **AREA-006**: IContentQueryDataContainer.ContentItemRequiredMemberRoleNames: IReadOnlyCollection<string>. Default interface implementation returns empty collection. ContentItemRolesResultProcessor populates it. Lazy: only fetched when ContentItemIsSecured=true for at least one result.

## Applicable Invariants

The content writer MUST satisfy and the reviewers MUST check all of the following invariants:

### INV-structure-019

- **Category**: `structure`
- **Severity**: `should`
- **Source**: `docs-style-guide-full.md`
- **Rule**: Reference and example pages: title with Reference - XYZ or Example - XYZ. Prefer embedding on main page; separate pages only when original is too long or relates to multiple pages.
- **Context**: References and examples section.

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

## Applicable Research Recommendations

### REC-001

- **Topic**: `api-reference`
- **Applicability**: `high`
- **Recommendation**: For each new public class and interface (MemberRoleInfo, ContentAccessSettings, IContentItemMemberRoleRetriever, IContentItemMemberRoleManager), provide a concise first sentence describing the element's purpose without repeating the class name and without saying 'this class does...'. Follow with usage context and a 5-20 line code sample at the top of each reference page.
- **Invariant Gate**: `approved`

### REC-002

- **Topic**: `api-reference`
- **Applicability**: `high`
- **Recommendation**: Document each method using present tense, verb-first descriptions following the pattern: getter returning boolean starts with 'Checks whether...'; getter returning other types starts with 'Gets the...'; void operations start with 'Sets the...', 'Updates the...', 'Deletes the...', or 'Registers...'; factory methods start with 'Creates a...'.
- **Invariant Gate**: `approved`

### REC-005

- **Topic**: `api-reference`
- **Applicability**: `high`
- **Recommendation**: Structure each API reference article with these standard sections in order: (1) Title with element name and type, (2) Description/introduction, (3) Declaration/syntax, (4) Parameters with type, required/optional status, and description, (5) Return value, (6) Remarks for non-obvious behavior, (7) Code example, (8) See also links. Mirror the product's namespace structure in the documentation hierarc
- **Invariant Gate**: `adapted`
- **Adaptation Note**: The Kentico article structure requires Title, Introduction, Body, Result, and Next Steps (INV-structure-001). The Microsoft reference sections map to this: Title remains, Declaration/Parameters/Remarks fold into Body, code example serves as Result illustration, See Also maps to Next Steps. The Kenti

### REC-014

- **Topic**: `api-reference`
- **Applicability**: `high`
- **Recommendation**: For code examples demonstrating the new membership API, start with the simplest scenario (checking if content is public) and build to complex scenarios (restricting content to specific roles, querying role membership). Each code sample should be preceded by an introductory sentence ending with a colon when immediately preceding the sample. Show expected output as a code comment within the sample.
- **Invariant Gate**: `approved`

## Acceptance Criteria

1. ContentItemRequiredMemberRoleNames property fully documented with type, default, and behavior
2. Lazy loading behavior explained (role data fetched only when secured items present)
3. ContentItemRolesResultProcessor mentioned as the populating mechanism
4. Code example shows accessing role names from query results (REC-014)
5. Reference style: title follows 'Reference - ' pattern (INV-structure-019)
6. All API members in backticks (INV-formatting-004)
7. API reference structure follows standard order (REC-005)

## Writer Instructions

### Updating an Existing Page

1. Open `developers-and-admins/api/content-item-api/reference-content-item-query.md`
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
