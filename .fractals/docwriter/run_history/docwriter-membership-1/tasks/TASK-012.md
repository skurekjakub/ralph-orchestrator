# TASK-012: Update Secure pages page (business users)

## Task Metadata

| Field | Value |
|-------|-------|
| **Task ID** | `TASK-012` |
| **Title** | Update Secure pages page (business users) |
| **Target Page** | `business-users/website-content/secure-pages.md` |
| **Action** | `update` |
| **Content Type** | `howto` |
| **Target Personas** | business |
| **Complexity** | medium |
| **Status** | planned |
| **Dependencies** | `TASK-011` |
| **Related Impacts** | `IMP-007`, `IMP-020` |

## Description

Consolidated update (IMP-007 + IMP-020): update Security tab instructions for role-based options, document role selection UI, update screenshots, explain three-tier model in business terms, and fix stale 'Requires authentication' description.

## Scope (from Impact Matrix)

### IMP-007: Secure pages

- **Type**: `update`
- **Priority**: `high`
- **Target Page**: `business-users/website-content/secure-pages.md`

**Scope details:**

- 1)
- Update step 4 ('Configure the page's security settings'
- to describe the new role-based options in addition to 'Requires authentication'. 2
- Document how to restrict a page to specific member roles via the Security tab. 3
- Update screenshots showing the new Security tab UI with role selection. 4
- Add explanation of the three-tier model in business-user terms: public, signed-in only, specific member roles. 5
- Add cross-reference to the Members application for role management.

### IMP-020: Secure pages

- **Type**: `stale-fix`
- **Priority**: `medium`
- **Target Page**: `business-users/website-content/secure-pages.md`

**Scope details:**

- 1)
- Update the 'Requires authentication' description to also mention role-based restrictions. 2
- Add description of the new role selection UI options. 3
- This overlaps with IMP-007; consolidate during writing.

> **Note**: Overlaps with IMP-007; consolidate during writing.

## Sections

### Sections to Modify

- Step 4 — configure page security settings (add role-based options)
- 'Requires authentication' description — expand for role-based restrictions
- Screenshots — update Security tab UI with role selection

### Sections to Add

- Three-tier model explanation in business terms: public / signed-in only / specific member roles
- How to restrict a page to specific member roles via Security tab
- Cross-reference to Members application for role management

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

- **AREA-002**: ContentAccessSettings supports three tiers: Public (no auth), Secured (any authenticated), SecuredWithRoles (specific roles).
- **AREA-012**: Admin UI member role pages already present. Localization strings updated.

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

### INV-structure-009

- **Category**: `structure`
- **Severity**: `must`
- **Source**: `docs-style-guide.md`
- **Rule**: Describe the end result at the end of each section so readers can confirm they followed instructions correctly.
- **Context**: Result section.

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

1. Security settings step updated with role-based options alongside 'Requires authentication'
2. Stale text about only requiring authentication is corrected
3. Three-tier model explained in business terms (public / signed-in / specific roles)
4. Step-by-step for restricting page to specific member roles (INV-structure-006, INV-structure-007)
5. One action per step for business users (INV-persona-001)
6. End result described (INV-structure-009)
7. Screenshot placeholders noted for updated Security tab UI
8. Cross-reference to Members application (REC-010)
9. Arrow notation for admin navigation (REC-011)

## Writer Instructions

### Updating an Existing Page

1. Open `business-users/website-content/secure-pages.md`
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
