# TASK-017: Update Content sync configuration page

## Task Metadata

| Field | Value |
|-------|-------|
| **Task ID** | `TASK-017` |
| **Title** | Update Content sync configuration page |
| **Target Page** | `developers-and-admins/configuration/content-sync-configuration.md` |
| **Action** | `update` |
| **Content Type** | `howto` |
| **Target Personas** | developer, admin |
| **Complexity** | small |
| **Status** | planned |
| **Dependencies** | None |
| **Related Impacts** | `IMP-019` |

## Description

Document that member role bindings and ContentAccessSettings are included in content sync, add MemberRole compatibility requirements note.

## Scope (from Impact Matrix)

### IMP-019: Content sync configuration

- **Type**: `update`
- **Priority**: `medium`
- **Target Page**: `developers-and-admins/configuration/content-sync-configuration.md`

**Scope details:**

- 1)
- In 'Ensure compatibility between instances' or 'Content sync internals', document that member role assignments on content items are synchronized. 2
- Add a note about MemberRole compatibility requirements between source and target instances. 3
- Mention that role-based access settings are included in content sync payloads.

## Sections

### Sections to Modify

- Ensure compatibility between instances / Content sync internals section

### Sections to Add

- Member role assignment synchronization note
- MemberRole compatibility requirements between instances
- Role-based access settings in sync payloads

## Code Analysis References

### AREA-014: Content Synchronization

- **Significance**: `none`
- **Summary**: No files in CMSSolution/ContentSynchronization/ changed in this commit. The change inventory listed 14 files including MemberRoleCompatibilityEvaluator, ContentItemMemberRoleAdapter, and MemberRoleAdapter, but these already existed on master with no diffs. The content sync adapters for member roles were part of a prior commit.
- **Behavioral Impact**: No changes.

## Doc Facts (for content writer)

- **AREA-014**: MemberRoleCompatibilityEvaluator, ContentItemMemberRoleAdapter, and MemberRoleAdapter already existed on master. No diffs in this commit.

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

1. Member role synchronization documented in compatibility or internals section
2. MemberRole compatibility requirements between source and target instances noted
3. Role-based access settings inclusion in sync payloads mentioned
4. Next steps link to member roles page (INV-structure-010)
5. Code elements in backticks (INV-formatting-004)

## Writer Instructions

### Updating an Existing Page

1. Open `developers-and-admins/configuration/content-sync-configuration.md`
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
