
{% raw %}

# Xperience Page Permission Model

The Xperience by Kentico page access control system has three layers that are all evaluated when a user performs a page operation.

## Three-Layer Permission Model

```
Layer 1: Application-level permissions (role → application access)
    ↓
Layer 2: Page-level ACL permissions (role → page-specific grants)
    ↓
Layer 3: Workflow roles (role → workflow step assignment)
```

### Layer 1 — Application-Level Permissions

Managed under **Role management** (`identifier: 7IVwCg`). Key permissions:

- **Access channel** — grants access to a specific website channel application. Required for all page operations in that channel.
- **Administrator role** — bypasses all page ACL checks entirely.
- **Manage permissions** application permission — also bypasses all page ACL checks.

### Layer 2 — Page ACL Permissions

Six page-level permissions defined in `resources/repositories/xperience/CMSSolution/Websites/ACLs/WebPageAclPermissions.cs`:

| Permission | Constant | Checked Individually? |
|---|---|---|
| Display | `DISPLAY` | Yes |
| Read | `READ` | Yes |
| Create | `CREATE` | No — requires Read |
| Update | `UPDATE` | No — requires Read |
| Delete | `DELETE` | No — requires Read |
| Synchronize | `SYNCHRONIZE` | No — requires Read |

### Layer 3 — Workflow Roles

When a page's content type is under workflow:
- The user must have a role assigned to the **current workflow step**, OR
- The user must have a role with **full control** for the workflow (allows bypassing step restrictions).

Workflow roles are configured per-step in the workflow definition. This layer only applies to content types that have a workflow assigned — pages without workflow skip this check.

**Important:** Workflows apply to all content types (pages, reusable content, headless items, emails), but page ACL permissions (Layer 2) only apply to pages. When documenting workflow permission callouts, scope page-specific guidance with "For pages, users also need..." phrasing.

## The Read Prerequisite Rule

**This is the most critical rule in the page permission model.**

The `WebPageAclPermissionEvaluator.EvaluatePagePermission()` method checks permissions as follows:

```csharp
// Simplified from resources/repositories/xperience/CMSSolution/Admin/Kentico.Xperience.Admin.Websites/WebPages/Acls/WebPageAclPermissionEvaluator.cs, lines 103–124
if (IndividuallyCheckedPermissions.Contains(permission))
{
    return grantedPermissions.Contains(permission);
}
// For all other permissions, Read is required as a prerequisite
return grantedPermissions.Contains(READ) && grantedPermissions.Contains(permission);
```

`IndividuallyCheckedPermissions` contains only `{ Read, Display }` (defined in `resources/repositories/xperience/CMSSolution/Websites/Website/WebsiteConstants.cs`).

**Effect:** Granting Create, Update, Delete, or Synchronize without also granting Read has **no effect**. The user will be denied because the Read prerequisite check fails first.

## Operation → Permission Mapping

Use this table when documenting which permissions a user needs for a specific operation.

| Operation | ACL Permission | Checked On | Child Evaluation | Effective Requirement |
|---|---|---|---|---|
| **Open page tab** | READ | The page | No | Read |
| **Publish** | UPDATE | The page | No | Read + Update |
| **Unpublish** | UPDATE | The page | No | Read + Update |
| **Change workflow step** | UPDATE | The page | No | Read + Update |
| **Discard draft** | UPDATE | The page | No | Read + Update |
| **Create new version** | UPDATE | The page | No | Read + Update |
| **Rename** | UPDATE | The page | No | Read + Update |
| **Cancel scheduled publish** | UPDATE | The page | No | Read + Update |
| **Cancel scheduled unpublish** | UPDATE | The page | No | Read + Update |
| **Create page/folder** | CREATE | **Parent** page | No | Read + Create (on parent) |
| **Delete page** | DELETE | The page | Yes (`evaluateChildPages: true`) | Read + Delete (on page and all children) |
| **Move page** | READ + UPDATE | Source page + children | Yes | Read + Update (source + children), Create (target parent) |
| **View versions** | READ | The page | No | Read |
| **Shareable preview** | READ | The page | No | Read |

### Admin Bypass

Users with the **Administrator role** or the **Manage permissions** application permission bypass all page ACL checks. When documenting permission requirements, always include this as a closing note:

```markdown
Users with the {% page_link 7IVwCg linkText="Administrator role" %} or the *Manage permissions* application permission bypass all page permission checks.
```

## Documentation Conventions

### Section pattern for operation-specific permissions

When adding a "Page permissions for X" section, follow the established pattern from the "Page permissions for moving pages" section:

```markdown
## Page permissions for <operation> pages

To <operation> a page, users need to have the following permissions:

- The *Access channel* {% page_link 7IVwCg linkText="application permission" %} for the respective website channel.
- <operation-specific ACL requirements from the table above>

Users with the {% page_link 7IVwCg linkText="Administrator role" %} or the *Manage permissions* application permission bypass all page permission checks.
```

### Callout for cross-referencing permissions from other pages

When a business-user or workflow page needs to mention page permissions without going into full detail:

```markdown
{% info %}
**Required page permissions**

<Context sentence>, users need the appropriate {% page_link permissions_pagelevel_xp linkText="page permissions" %} (*Read* and *<specific permission>*) for the page. Users with the *Administrator* role or the *Manage permissions* permission are exempt from page permission checks.
{% endinfo %}
```

Use `info` callout type for cross-references (supplementary context), `note` for prerequisites or constraints.

### Workflow callout scoping

Workflow callouts must be scoped correctly since workflows apply to multiple content types:

```markdown
Users need the appropriate {% page_link 7IVwCg linkText="application-level" %} permission to access the application where the item is managed. For pages, users also need *Read* and *Update* {% page_link permissions_pagelevel_xp linkText="page permissions" %} on the page they are working with.
```

The "For pages, users also need..." phrasing correctly limits page-specific guidance without implying page permissions apply to reusable content, headless items, or emails.

## Key Page Identifiers

| Identifier | Page |
|---|---|
| `permissions_pagelevel_xp` | Page permission management |
| `7IVwCg` | Role management |
| `MAKQC` | Edit and publish pages |
| `workflows_xp` | Workflows |
| `LwKQC` | Create pages |
| `XofWCQ` | Delete pages |

## Source Code Reference Files

| File | What It Contains |
|---|---|
| `resources/repositories/xperience/CMSSolution/Websites/ACLs/WebPageAclPermissions.cs` | Permission constant definitions (Display, Read, Create, Update, Delete, Synchronize) |
| `resources/repositories/xperience/CMSSolution/Websites/Website/WebsiteConstants.cs` | `IndividuallyCheckedPermissions` — { Read, Display } |
| `resources/repositories/xperience/CMSSolution/Admin/Kentico.Xperience.Admin.Websites/WebPages/Acls/WebPageAclPermissionEvaluator.cs` | Core ACL evaluation logic including Read prerequisite |
| `resources/repositories/xperience/CMSSolution/Admin/Kentico.Xperience.Admin.Websites/UIPages/WebPages/WebPage/Content/ContentTab.cs` | Command → ACL mapping for publish, unpublish, rename, discard, versions, etc. |
| `resources/repositories/xperience/CMSSolution/Admin/Kentico.Xperience.Admin.Websites/UIPages/WebPages/WebPage/Content/PublishPage/ContentWebPagePublish.cs` | Publish confirmation page ACL checks |
| `resources/repositories/xperience/CMSSolution/Admin/Kentico.Xperience.Admin.Websites/UIPages/WebPages/WebPage/WebPageUnpublishBase.cs` | Unpublish handler ACL checks |
| `resources/repositories/xperience/CMSSolution/Admin/Kentico.Xperience.Admin.Websites/UIPages/WebPages/WebPage/Create/WebPage/CreateWebPage.cs` | Create page ACL checks (on parent) |
| `resources/repositories/xperience/CMSSolution/Admin/Kentico.Xperience.Admin.Websites/UIPages/WebPages/WebPagesApplication.cs` | Delete page ACL checks (with child evaluation) |
| `resources/repositories/xperience/CMSSolution/Admin/Kentico.Xperience.Admin.Websites/UIPages/WebPages/WebPage/WebPageBase.cs` | Baseline Read check on page tab open |

{% endraw %}
