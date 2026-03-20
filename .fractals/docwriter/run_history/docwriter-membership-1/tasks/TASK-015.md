# TASK-015: Update Handle global events page

## Task Metadata

| Field | Value |
|-------|-------|
| **Task ID** | `TASK-015` |
| **Title** | Update Handle global events page |
| **Target Page** | `developers-and-admins/customization/handle-global-events.md` |
| **Action** | `update` |
| **Content Type** | `howto` |
| **Target Personas** | developer |
| **Complexity** | small |
| **Status** | planned |
| **Dependencies** | `TASK-014` |
| **Related Impacts** | `IMP-017` |

## Description

Update event handler examples to use ContentAccessSettings.Public() instead of null, add cross-reference to events reference page, add note about non-nullable AccessSettings.

## Scope (from Impact Matrix)

### IMP-017: Handle global events

- **Type**: `update`
- **Priority**: `medium`
- **Target Page**: `developers-and-admins/customization/handle-global-events.md`

**Scope details:**

- 1)
- If any examples modify AccessSettings in event handlers, update them to use ContentAccessSettings.Public(
- instead of null. 2
- Add a cross-reference to the Reference - Global system events page noting the null validation change. 3
- Add a note that AccessSettings on event data states is non-nullable.

## Sections

### Sections to Modify

- Event handler examples using AccessSettings (if any set null)

### Sections to Add

- Note about non-nullable AccessSettings on event data states
- Cross-reference to Reference — Global system events for full constraints

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

- **AREA-003**: Setting AccessSettings to null on event data states now throws ArgumentNullException. Use ContentAccessSettings.Public() for unsecured.
- **AREA-004**: Same null validation on website event data states, WebPageMetadata, CreateWebPageParameters.

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

## Acceptance Criteria

1. Any examples setting AccessSettings to null are updated to use ContentAccessSettings.Public()
2. Non-nullable AccessSettings constraint mentioned
3. Cross-reference to events reference page added (INV-structure-010)
4. Code elements in backticks (INV-formatting-004)

## Writer Instructions

### Updating an Existing Page

1. Open `developers-and-admins/customization/handle-global-events.md`
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
