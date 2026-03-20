# TASK-013: Update Content items page (business users)

## Task Metadata

| Field | Value |
|-------|-------|
| **Task ID** | `TASK-013` |
| **Title** | Update Content items page (business users) |
| **Target Page** | `business-users/content-hub/content-items.md` |
| **Action** | `update` |
| **Content Type** | `howto` |
| **Target Personas** | business |
| **Complexity** | medium |
| **Status** | planned |
| **Dependencies** | `TASK-011` |
| **Related Impacts** | `IMP-008` |

## Description

Update Secure content items section for role-based security options, document role restriction via Security settings, update screenshots, and add cross-reference to member roles management.

## Scope (from Impact Matrix)

### IMP-008: Content items

- **Type**: `update`
- **Priority**: `high`
- **Target Page**: `business-users/content-hub/content-items.md`

**Scope details:**

- 1)
- Update 'Secure content items' section to describe role-based security options alongside 'Requires authentication'. 2
- Document how to restrict content items to specific member roles via Security settings. 3
- Update the description 'Secured content items require that the consumer is signed in' to also cover role-restricted scenarios. 4
- Update screenshots showing the expanded Security settings UI. 5
- Add cross-reference to the new member roles management page.

## Sections

### Sections to Modify

- Secure content items section — add role-based security alongside 'Requires authentication'
- Description 'Secured content items require that the consumer is signed in' — expand for role restrictions
- Screenshots — update Security settings UI

### Sections to Add

- How to restrict content items to specific member roles
- Cross-reference to member roles management page

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

- **AREA-002**: Content items can now be restricted to specific member roles, not just any authenticated user.
- **AREA-012**: Admin UI for security settings already supports role selection.

## Applicable Invariants

The content writer MUST satisfy and the reviewers MUST check all of the following invariants:

### INV-structure-006

- **Category**: `structure`
- **Severity**: `must`
- **Source**: `docs-style-guide.md`
- **Rule**: Use ordered lists for step-by-step instructions. Use bullet points when order does not matter.
- **Context**: Body: General guidelines.

### INV-structure-007

- **Category**: `structure`
- **Severity**: `must`
- **Source**: `docs-style-guide.md`
- **Rule**: Write one action per step for business users. For developer audience, you may merge two related easy steps.
- **Context**: Writing steps.

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

### REC-013

- **Topic**: `membership`
- **Applicability**: `high`
- **Recommendation**: Consistently use the established Kentico terminology throughout all membership documentation: 'member' for a registered visitor without admin access, 'visitor' for an anonymous website user, 'user' for an admin account holder. Use 'sign in' (verb) and 'sign-in' (adjective/noun) — never 'log in'. Use 'register' rather than 'sign up' for account creation.
- **Invariant Gate**: `approved`

## Acceptance Criteria

1. Secure content items section describes role-based security options (REC-010)
2. 'Requires authentication' description expanded to cover role-restricted scenarios
3. Step-by-step for restricting content items to roles (INV-structure-006, INV-structure-007)
4. Business-user friendly: no developer jargon (INV-persona-001)
5. Screenshot placeholders for expanded Security settings UI
6. Cross-reference to member roles management
7. Terminology: member, visitor (INV-content-030, REC-013)

## Writer Instructions

### Updating an Existing Page

1. Open `business-users/content-hub/content-items.md`
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
