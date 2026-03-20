# TASK-011: Update Members page (business users)

## Task Metadata

| Field | Value |
|-------|-------|
| **Task ID** | `TASK-011` |
| **Title** | Update Members page (business users) |
| **Target Page** | `business-users/members.md` |
| **Action** | `update` |
| **Content Type** | `howto` |
| **Target Personas** | business |
| **Complexity** | large |
| **Status** | planned |
| **Dependencies** | `TASK-001` |
| **Related Impacts** | `IMP-009` |

## Description

Add member roles section covering creating, viewing, and assigning members to roles. Update introduction to mention role-based access control. Add cross-references and screenshots.

## Scope (from Impact Matrix)

### IMP-009: Members

- **Type**: `update`
- **Priority**: `high`
- **Target Page**: `business-users/members.md`

**Scope details:**

- 1)
- Add a new section on member roles (creating, viewing, assigning members to roles). 2
- Update the introduction to mention that members can be assigned to roles for content access control. 3
- Add cross-references to Secure pages and Secure content items pages. 4
- Add screenshots of the role management interface in the Members application. 5
- Mention that the member listing header sentence should note role-based access as a capability.

## Sections

### Sections to Modify

- Introduction — mention role-based access capability
- Member listing header sentence

### Sections to Add

- Member roles section — creating roles, viewing roles, assigning members to roles
- Cross-references to Secure pages and Secure content items
- Screenshots of role management interface

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

### AREA-012: Admin UI - Member Role Management

- **Significance**: `low`
- **Summary**: The change inventory listed 14 files including member role admin UI pages, but actual diffs show only: KenticoAdminBaseResources.resx (localization strings), KenticoAdminClientResources.resx (client localization), ContentHubExplorerPanelExtenderBase.cs, IContentLanguageAwarePage.cs, ScheduledTaskConfigurationEdit.cs, and TaxonomyList.cs. The member role listing/create/edit pages (MemberRoleList, MemberRoleCreate, MemberRoleEdit) and ContentListingCommandManager already existed on master. No Base
- **Behavioral Impact**: Admin resource strings updated. No functional changes to member role admin UI pages in this commit—they were already present.

## Doc Facts (for content writer)

- **AREA-002**: MemberRoleInfo and MemberRoleMemberInfo types support role creation and member-role assignment.
- **AREA-012**: Admin resource strings updated. Member role admin UI pages (listing/create/edit) already present.

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

### INV-structure-006

- **Category**: `structure`
- **Severity**: `must`
- **Source**: `docs-style-guide.md`
- **Rule**: Use ordered lists for step-by-step instructions. Use bullet points when order does not matter.
- **Context**: Body: General guidelines.

### INV-persona-001

- **Category**: `persona`
- **Severity**: `must`
- **Source**: `docs-style-guide.md`
- **Rule**: Business users: friendly, positive tone. One action per step. No technical jargon. More screenshots for clarity.
- **Context**: Target audiences: Business users.

### INV-persona-002

- **Category**: `persona`
- **Severity**: `must`
- **Source**: `docs-style-guide.md`
- **Rule**: Business users: assume they work on a team that includes technical people who handle setup tasks.
- **Context**: Target audiences: Business users.

## Applicable Research Recommendations

### REC-010

- **Topic**: `admin-ui`
- **Applicability**: `high`
- **Recommendation**: For admin UI procedures (creating member roles, assigning members to roles, configuring content security), tell the user where the action takes place before describing the action. Use the pattern: 'In the [location], [action].' Limit each procedure to 8 steps maximum. If a workflow exceeds 8 steps, split into subsections with distinct headings. Include the finalizing action (e.g., Save) as an expl
- **Invariant Gate**: `approved`

### REC-011

- **Topic**: `admin-ui`
- **Applicability**: `high`
- **Recommendation**: Use the Kentico-specific arrow notation (e.g., **Members** -> **Roles**) for navigation paths through the admin UI. When referring to admin applications, always use the pattern 'Open the [Application name] application' with application name in bold.
- **Invariant Gate**: `adapted`
- **Adaptation Note**: Microsoft recommends > (right angle bracket) for navigation paths, but INV-style-046 mandates -> (arrow). The recommendation is adapted to use -> instead. INV-style-047 prohibits mixing UI element types in arrow notation. INV-content-002 requires 'Open the XXX application' pattern. INV-content-039 d

### REC-013

- **Topic**: `membership`
- **Applicability**: `high`
- **Recommendation**: Consistently use the established Kentico terminology throughout all membership documentation: 'member' for a registered visitor without admin access, 'visitor' for an anonymous website user, 'user' for an admin account holder. Use 'sign in' (verb) and 'sign-in' (adjective/noun) — never 'log in'. Use 'register' rather than 'sign up' for account creation.
- **Invariant Gate**: `approved`

## Acceptance Criteria

1. Member roles section covers: creating roles, viewing roles, assigning members (REC-010)
2. Introduction updated to mention role-based access control
3. Business-user friendly tone: no technical jargon (INV-persona-001)
4. One action per step for business users (INV-persona-001, INV-structure-006)
5. Screenshots placeholder noted for role management interface
6. Arrow notation for navigation paths (REC-011)
7. Cross-references to Secure pages and Secure content items
8. Terminology: member, visitor (INV-content-030, REC-013)

## Writer Instructions

### Updating an Existing Page

1. Open `business-users/members.md`
2. Modify the sections listed above while preserving existing structure
3. Ensure the page remains self-contained (INV-structure-011)
4. Update Next Steps if new cross-references are needed

### Business User Writing Guidelines

- Use friendly, positive tone (INV-persona-001)
- One action per step (INV-persona-001, INV-structure-007)
- No technical jargon — no code references, no API terms
- More screenshots for clarity (INV-persona-001)
- Assume reader works on a team with technical people (INV-persona-002)
- Use **Members** -> **Roles** arrow notation for navigation (REC-011)
- Location before action: 'In the [location], [action]' (REC-010)

### Terminology (INV-content-030, REC-013)

- **member**: registered visitor without admin access
- **visitor**: anonymous website user
- **user**: admin account holder in the Xperience admin UI
- **contact**: Xperience entity for tracking visitor activity
- Use **sign in** (verb) / **sign-in** (adjective/noun) — never 'log in'
- Use **member role** — not 'membership role' or 'user role'

### Shared Pattern: NoOpApplicationRole → ApplicationRole

Not directly affected by this pattern. No code sample migration needed.
