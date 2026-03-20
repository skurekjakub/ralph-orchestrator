# TASK-016: Update Reference — CI/CD object types page

## Task Metadata

| Field | Value |
|-------|-------|
| **Task ID** | `TASK-016` |
| **Title** | Update Reference — CI/CD object types page |
| **Target Page** | `developers-and-admins/ci-cd/reference-ci-cd-object-types.md` |
| **Action** | `update` |
| **Content Type** | `reference` |
| **Target Personas** | developer, admin |
| **Complexity** | small |
| **Status** | planned |
| **Dependencies** | None |
| **Related Impacts** | `IMP-018` |

## Description

Add member role object types (cms.memberrole, cms.memberrolemember, cms.contentitemmemberrole) to CI/CD object types reference if these are CI/CD-supported.

## Scope (from Impact Matrix)

### IMP-018: Reference - CI/CD object types

- **Type**: `update`
- **Priority**: `medium`
- **Target Page**: `developers-and-admins/ci-cd/reference-ci-cd-object-types.md`

**Scope details:**

- 1)
- Check if MemberRoleInfo, MemberRoleMemberInfo, and ContentItemMemberRoleInfo are included in CI/CD processing. 2
- If yes, add these object types to the appropriate section (General or Binding object types). 3
- Document the custom processor if relevant to CI/CD documentation.

## Sections

### Sections to Modify

- General or Binding object types section — add member role types

## Code Analysis References

### AREA-015: Continuous Integration Processing

- **Significance**: `none`
- **Summary**: No files in CMSSolution/ContentEngine/ContinuousIntegration/ changed in this commit. The CI custom processor for member roles (ContentItemMemberRoleCustomProcessor) and CI filter already existed on master.
- **Behavioral Impact**: No changes.

### AREA-017: Database Schema and Migrations

- **Significance**: `none`
- **Summary**: No CMS App_Data CI repository XML files changed in this commit. The database schema for cms.memberrole, cms.memberrolemember, and cms.contentitemmemberrole tables already existed on master. The alternative form definitions (create.xml, edit.xml) for member roles were in place.
- **Behavioral Impact**: No changes.

## Doc Facts (for content writer)

- **AREA-015**: ContentItemMemberRoleCustomProcessor and CI filter already existed on master. No changes in this commit, but types are CI/CD supported.
- **AREA-017**: No actual file changes in this commit for CI/CD processing files.

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

## Acceptance Criteria

1. Member role object types added if CI/CD-supported: cms.memberrole, cms.memberrolemember, cms.contentitemmemberrole
2. Placed in correct section (General or Binding object types)
3. Reference title pattern (INV-structure-019)
4. Object type names in backticks (INV-formatting-004)

## Writer Instructions

### Updating an Existing Page

1. Open `developers-and-admins/ci-cd/reference-ci-cd-object-types.md`
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
