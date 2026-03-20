# TASK-002: Create new page: Reference — ContentAccessSettings

## Task Metadata

| Field | Value |
|-------|-------|
| **Task ID** | `TASK-002` |
| **Title** | Create new page: Reference — ContentAccessSettings |
| **Target Page** | `developers-and-admins/api/content-item-api/reference-content-access-settings.md` |
| **Action** | `create` |
| **Content Type** | `reference` |
| **Target Personas** | developer |
| **Complexity** | large |
| **Status** | planned |
| **Dependencies** | None |
| **Related Impacts** | `IMP-014` |

## Description

Create a new API reference page for the ContentAccessSettings sealed class — documenting the struct-to-class migration (breaking change), static factory methods Public()/Secured()/SecuredWithRoles(), equality operators, null handling, and usage examples.

## Scope (from Impact Matrix)

### IMP-014: Reference - ContentAccessSettings

- **Type**: `new-page`
- **Priority**: `high`
- **Target Page**: `developers-and-admins/api/content-item-api/reference-content-access-settings.md`

**Scope details:**

- New reference page covering: 1
- ContentAccessSettings class overview — sealed class, three-tier model. 2
- Static factory methods: Public(), Secured(), SecuredWithRoles(IEnumerable<string> roleCodeNames). 3
- Equality operators (==, !=
- and Equals(
- behavior. 4
- Breaking change note: struct-to-class migration — code relying on value-type semantics (default(ContentAccessSettings), stack allocation
- must be updated. 5
- Usage examples with event handlers and parameter classes. 6
- Null handling: AccessSettings properties now throw ArgumentNullException if set to null — use ContentAccessSettings.Public(
- instead.

## Sections

### Sections to Add

- Front matter (title, identifier, order, persona)
- Introduction — ContentAccessSettings overview and purpose
- Breaking change note — struct to sealed class migration
- Static factory methods — Public(), Secured(), SecuredWithRoles()
- Comparison table — three access modes side by side
- Equality operators — ==, !=, Equals() behavior
- Null handling — ArgumentNullException on null assignment, use Public() instead
- Usage examples with event handlers and parameter classes
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

## Doc Facts (for content writer)

- **AREA-002**: ContentAccessSettings changed from struct to sealed class. New operators: ==(ContentAccessSettings, ContentAccessSettings), !=(ContentAccessSettings, ContentAccessSettings). Equality is now null-safe with operator overloads.
- **AREA-003**: All 8 content engine event data state classes gain null validation (ArgumentNullException.ThrowIfNull) on AccessSettings property. Previously accepted null silently.
- **AREA-004**: 6 website event data state classes gain same null validation. WebPageMetadata and CreateWebPageParameters also validate non-null.
- **AREA-005**: ContentItemMetadata.AccessSettings and CreateContentItemParameters.AccessSettings now validate non-null.

## Applicable Invariants

The content writer MUST satisfy and the reviewers MUST check all of the following invariants:

### INV-structure-001

- **Category**: `structure`
- **Severity**: `must`
- **Source**: `docs-style-guide.md`
- **Rule**: Every documentation article must contain: Title, Introduction, Body, Result, and Next Steps.
- **Context**: Documentation page structure: Required elements.

### INV-structure-019

- **Category**: `structure`
- **Severity**: `should`
- **Source**: `docs-style-guide-full.md`
- **Rule**: Reference and example pages: title with Reference - XYZ or Example - XYZ. Prefer embedding on main page; separate pages only when original is too long or relates to multiple pages.
- **Context**: References and examples section.

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

### REC-002

- **Topic**: `api-reference`
- **Applicability**: `high`
- **Recommendation**: Document each method using present tense, verb-first descriptions following the pattern: getter returning boolean starts with 'Checks whether...'; getter returning other types starts with 'Gets the...'; void operations start with 'Sets the...', 'Updates the...', 'Deletes the...', or 'Registers...'; factory methods start with 'Creates a...'.
- **Invariant Gate**: `approved`

### REC-003

- **Topic**: `api-reference`
- **Applicability**: `high`
- **Recommendation**: For parameters of new API methods (e.g., IContentItemMemberRoleManager.UpdateBindings parameters), capitalize the first word of each description and end with a period. Describe non-boolean parameters starting with 'The' or 'A'. For boolean parameters, use the pattern 'If true, [action]. If false, [action].' or 'True if [condition]; false otherwise.' Always state the default value using 'Default: [
- **Invariant Gate**: `approved`

### REC-004

- **Topic**: `api-reference`
- **Applicability**: `high`
- **Recommendation**: For deprecated members (IsSecured properties marked [Obsolete] across ContentItemEventArgsBase, WebPageEventArgsBase, ContentItemMetadata, and all event args classes), document the deprecation by stating: (a) the property is deprecated since version 31.3, (b) what replacement to use (AccessSettings with ContentAccessSettings), and (c) a migration code snippet showing the old pattern and the new eq
- **Invariant Gate**: `approved`

### REC-005

- **Topic**: `api-reference`
- **Applicability**: `high`
- **Recommendation**: Structure each API reference article with these standard sections in order: (1) Title with element name and type, (2) Description/introduction, (3) Declaration/syntax, (4) Parameters with type, required/optional status, and description, (5) Return value, (6) Remarks for non-obvious behavior, (7) Code example, (8) See also links. Mirror the product's namespace structure in the documentation hierarc
- **Invariant Gate**: `adapted`
- **Adaptation Note**: The Kentico article structure requires Title, Introduction, Body, Result, and Next Steps (INV-structure-001). The Microsoft reference sections map to this: Title remains, Declaration/Parameters/Remarks fold into Body, code example serves as Result illustration, See Also maps to Next Steps. The Kenti

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

### REC-015

- **Topic**: `membership`
- **Applicability**: `high`
- **Recommendation**: When mentioning MemberRoleInfo, ContentAccessSettings, or other new types in prose, always use backtick formatting for the type name and never pluralize the code element directly. Write 'MemberRoleInfo objects' or 'ContentAccessSettings instances' — not 'MemberRoleInfos' or 'ContentAccessSettingss'.
- **Invariant Gate**: `approved`

## Acceptance Criteria

1. Title follows 'Reference - ContentAccessSettings' pattern (INV-structure-019)
2. Struct-to-class breaking change clearly documented with migration guidance (REC-004)
3. All three factory methods documented: Public(), Secured(), SecuredWithRoles() (REC-001, REC-002)
4. Comparison table showing three access modes (REC-012)
5. Equality operators (==, !=) and Equals() behavior documented
6. Null handling documented: ArgumentNullException when setting null, use Public() instead
7. Code examples for each factory method and event handler usage (REC-014)
8. Correct front matter with unique identifier (INV-frontmatter-001, INV-frontmatter-002)
9. Parameter descriptions follow verb-first pattern (REC-002, REC-003)
10. Backtick formatting for all code elements (INV-formatting-004, REC-015)
11. API reference sections in standard order (REC-005 adapted to Kentico structure)

## Writer Instructions

### Creating a New Page

1. Create a new file at `developers-and-admins/api/content-item-api/reference-content-access-settings.md`
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
