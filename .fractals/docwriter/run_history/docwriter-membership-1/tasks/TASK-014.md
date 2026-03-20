# TASK-014: Update Reference — Global system events page

## Task Metadata

| Field | Value |
|-------|-------|
| **Task ID** | `TASK-014` |
| **Title** | Update Reference — Global system events page |
| **Target Page** | `developers-and-admins/customization/handle-global-events/reference-global-system-events.md` |
| **Action** | `update` |
| **Content Type** | `reference` |
| **Target Personas** | developer |
| **Complexity** | medium |
| **Status** | planned |
| **Dependencies** | `TASK-002` |
| **Related Impacts** | `IMP-012` |

## Description

Update ContentItemEvents and WebPageEvents sections for AccessSettings null validation, document three-tier ContentAccessSettings model in event context, and add AccessSettings property documentation on event argument state objects.

## Scope (from Impact Matrix)

### IMP-012: Reference - Global system events

- **Type**: `update`
- **Priority**: `medium`
- **Target Page**: `developers-and-admins/customization/handle-global-events/reference-global-system-events.md`

**Scope details:**

- 1)
- In the ContentItemEvents section, update the UpdateMetadata event description to note that AccessSettings accepts non-null ContentAccessSettings values (use ContentAccessSettings.Public(
- for unsecured). 2
- In the WebPageEvents section, update UpdateSecuritySettings event to document the same constraint. 3
- Add a note about the three-tier ContentAccessSettings model (Public/Secured/SecuredWithRoles
- where event arguments reference security settings. 4
- If not already present, document AccessSettings as a property available on event argument state objects.

## Sections

### Sections to Modify

- ContentItemEvents section — UpdateMetadata event: non-null AccessSettings requirement
- WebPageEvents section — UpdateSecuritySettings event: non-null AccessSettings

### Sections to Add

- Three-tier ContentAccessSettings model note (Public/Secured/SecuredWithRoles)
- AccessSettings property documentation on event state objects

## Code Analysis References

### AREA-003: Content Engine Events and Handler Arguments

- **Significance**: `medium`
- **Summary**: All 8 content engine event data state classes gain null validation (ArgumentNullException.ThrowIfNull) on the internal setter of the AccessSettings property. This is a defensive hardening change—the AccessSettings property and ContentAccessSettings type already existed. No new properties or event signatures are added. No handler argument files changed in this commit.

**Breaking Changes:**
- ⚠️ Setting AccessSettings to null on any event data state now throws ArgumentNullException. Previously accepted null silently. This is stricter validation, not a signature change.
- **Behavioral Impact**: Event data states for Create, CreateLanguageVariant, Delete, Publish, Unpublish, UpdateDraft, UpdateLanguageMetadata, and UpdateMetadata now enforce non-null AccessSettings. Code in event handlers that sets AccessSettings = null will throw. The default remains ContentAccessSettings.Public().

### AREA-004: Website Events and Handler Arguments

- **Significance**: `medium`
- **Summary**: Same null validation pattern as AREA-003 applied to 6 website event data state classes (Delete, Move, Publish, Unpublish, UpdateSecuritySettings, UpdateTreePathSlug). Additionally, WebPageMetadata and CreateWebPageParameters gain null validation on their AccessSettings property setters. CreateFolderLanguageVariantEventArgs has a trivial whitespace change. No handler argument signatures changed.

**Breaking Changes:**
- ⚠️ Setting AccessSettings to null on WebPageMetadata (init accessor) or CreateWebPageParameters (set accessor) now throws ArgumentNullException.
- ⚠️ Setting AccessSettings to null on website event data states now throws ArgumentNullException.
- **Behavioral Impact**: Web page creation and update flows now enforce non-null AccessSettings throughout. Developers using CreateWebPageParameters or WebPageMetadata must use ContentAccessSettings.Public() instead of null.

## Doc Facts (for content writer)

- **AREA-003**: All 8 content engine event data states gain null validation (ArgumentNullException.ThrowIfNull) on AccessSettings. Previously accepted null silently.
- **AREA-004**: 6 website event data states gain same null validation. WebPageMetadata and CreateWebPageParameters also validate non-null.

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

## Applicable Research Recommendations

### REC-001

- **Topic**: `api-reference`
- **Applicability**: `high`
- **Recommendation**: For each new public class and interface (MemberRoleInfo, ContentAccessSettings, IContentItemMemberRoleRetriever, IContentItemMemberRoleManager), provide a concise first sentence describing the element's purpose without repeating the class name and without saying 'this class does...'. Follow with usage context and a 5-20 line code sample at the top of each reference page.
- **Invariant Gate**: `approved`

### REC-004

- **Topic**: `api-reference`
- **Applicability**: `high`
- **Recommendation**: For deprecated members (IsSecured properties marked [Obsolete] across ContentItemEventArgsBase, WebPageEventArgsBase, ContentItemMetadata, and all event args classes), document the deprecation by stating: (a) the property is deprecated since version 31.3, (b) what replacement to use (AccessSettings with ContentAccessSettings), and (c) a migration code snippet showing the old pattern and the new eq
- **Invariant Gate**: `approved`

### REC-012

- **Topic**: `access-control`
- **Applicability**: `high`
- **Recommendation**: For reference documentation of the ContentAccessSettings model and its static factory methods (Public(), Secured(), SecuredWithRoles()), describe each as a neutral, authoritative statement of what the method returns and when to use each variant. Use a comparison table showing the three access modes side by side (columns: method name, IsSecured value, RequiredMemberRoleIDs value, use case).
- **Invariant Gate**: `approved`

## Acceptance Criteria

1. UpdateMetadata event: AccessSettings accepts non-null ContentAccessSettings, use Public() for unsecured (REC-004)
2. UpdateSecuritySettings event: same non-null constraint documented
3. Three-tier ContentAccessSettings model noted where events reference security settings (REC-012)
4. AccessSettings property documented on event argument state objects
5. Reference title pattern followed (INV-structure-019)
6. All code elements in backticks (INV-formatting-004)
7. Deprecation pattern for IsSecured properties documented (REC-004)

## Writer Instructions

### Updating an Existing Page

1. Open `developers-and-admins/customization/handle-global-events/reference-global-system-events.md`
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
