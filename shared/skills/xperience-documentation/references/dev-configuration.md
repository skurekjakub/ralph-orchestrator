# Configuration (Developers and Admins)

The configuration section is the largest documentation area — it covers all system administration topics: website/headless channels, users and roles, workflows, languages, taxonomies, macros, email, media libraries, RTE configuration, settings, and more.

## Documentation pages

| Page | Path | What it covers |
|---|---|---|
| **Configuration** (index) | `./src/_documentation/_documentation/developers-and-admins/configuration.md` | Overview of system configuration areas |

### Channel management

| Page | Path | What it covers |
|---|---|---|
| Website channel management | `./src/_documentation/_documentation/developers-and-admins/configuration/website-channel-management.md` | Creating and configuring website channels; domain binding; channel settings |
| → Manage multiple websites | `./src/_documentation/_documentation/developers-and-admins/configuration/website-channel-management/manage-multiple-websites.md` | Multi-site setup; channel isolation |
| Headless channel management | `./src/_documentation/_documentation/developers-and-admins/configuration/headless-channel-management.md` | Creating headless channels; API tokens; headless delivery configuration |
| Administration domain configuration | `./src/_documentation/_documentation/developers-and-admins/configuration/administration-domain-configuration.md` | Configuring the admin domain and URL |

### Users, roles & permissions

| Page | Path | What it covers |
|---|---|---|
| Users | `./src/_documentation/_documentation/developers-and-admins/configuration/users.md` | Admin user management overview |
| → User management | `./src/_documentation/_documentation/developers-and-admins/configuration/users/user-management.md` | Creating and managing admin users |
| → Role management | `./src/_documentation/_documentation/developers-and-admins/configuration/users/role-management.md` | Configuring roles and application permissions |
| → (subfolder) | `./src/_documentation/_documentation/developers-and-admins/configuration/users/role-management/` | Detailed role management pages |
| → Administration registration and authentication | `./src/_documentation/_documentation/developers-and-admins/configuration/users/administration-registration-and-authentication.md` | Admin login configuration; external auth for admin users |
| → (subfolder) | `./src/_documentation/_documentation/developers-and-admins/configuration/users/administration-registration-and-authentication/` | Detailed admin auth topics |

### Content management configuration

| Page | Path | What it covers |
|---|---|---|
| Content hub configuration | `./src/_documentation/_documentation/developers-and-admins/configuration/content-hub-configuration.md` | Content hub application settings |
| Content versioning configuration | `./src/_documentation/_documentation/developers-and-admins/configuration/content-versioning-configuration.md` | Draft/published versioning settings |
| Content sync configuration | `./src/_documentation/_documentation/developers-and-admins/configuration/content-sync-configuration.md` | Content synchronization settings |
| Workflows | `./src/_documentation/_documentation/developers-and-admins/configuration/workflows.md` | Creating approval workflows; workflow steps; step roles; workflow scope |
| Languages | `./src/_documentation/_documentation/developers-and-admins/configuration/languages.md` | Configuring content languages; default language; language fallback |
| Taxonomies | `./src/_documentation/_documentation/developers-and-admins/configuration/taxonomies.md` | Creating and managing taxonomies (tags) for content classification |

### Macros & expressions

| Page | Path | What it covers |
|---|---|---|
| Macro expressions | `./src/_documentation/_documentation/developers-and-admins/configuration/macro-expressions.md` | Overview of the macro system |
| → (subfolder) | `./src/_documentation/_documentation/developers-and-admins/configuration/macro-expressions/` | Detailed macro topics (syntax, available macros, security) |

### UI & editor configuration

| Page | Path | What it covers |
|---|---|---|
| Rich text editor configuration | `./src/_documentation/_documentation/developers-and-admins/configuration/rich-text-editor-configuration.md` | Configuring the RTE toolbar, allowed content, plugins |
| → (subfolder) | `./src/_documentation/_documentation/developers-and-admins/configuration/rich-text-editor-configuration/` | Detailed RTE configuration topics |
| Shareable preview URLs | `./src/_documentation/_documentation/developers-and-admins/configuration/shareable-preview-urls.md` | Configuring shareable page preview links |
| Notifications | `./src/_documentation/_documentation/developers-and-admins/configuration/notifications.md` | System notification settings |

### Infrastructure & operational

| Page | Path | What it covers |
|---|---|---|
| Email configuration | `./src/_documentation/_documentation/developers-and-admins/configuration/email-configuration.md` | SMTP settings; email sending configuration |
| Media library configuration | `./src/_documentation/_documentation/developers-and-admins/configuration/media-library-configuration.md` | Media library storage and access settings |
| Recycle bin management | `./src/_documentation/_documentation/developers-and-admins/configuration/recycle-bin-management.md` | Recycle bin retention and cleanup settings |
| Event log | `./src/_documentation/_documentation/developers-and-admins/configuration/event-log.md` | Viewing and managing the system event log |
| Settings | `./src/_documentation/_documentation/developers-and-admins/configuration/settings.md` | Global system settings reference |
| System overview | `./src/_documentation/_documentation/developers-and-admins/configuration/system-overview.md` | System status dashboard; version info; health indicators |
| Auto-scaling support | `./src/_documentation/_documentation/developers-and-admins/configuration/auto-scaling-support.md` | Running Xperience in auto-scaled environments; web farm sync |
| SaaS configuration | `./src/_documentation/_documentation/developers-and-admins/configuration/saas-configuration.md` | SaaS-specific configuration options |
| AIRA configuration | `./src/_documentation/_documentation/developers-and-admins/configuration/aira-configuration.md` | Configuring the AI assistant (AIRA) |
| Reference: configuration keys | `./src/_documentation/_documentation/developers-and-admins/configuration/reference-configuration-keys.md` | Full reference of all configuration keys (appsettings.json) |

## Key concepts

- **Website channels** define individual websites with their own domain, languages, and content tree. Multi-site setups use separate channels.
- **Headless channels** serve content via REST API without a presentation layer.
- **Roles** grant application-level permissions (access to admin applications) and can be assigned page-level ACL permissions.
- **Workflows** add approval steps before content can be published. Each step can require specific roles.
- **Languages** are configured at the system level. Channels select which languages they support from the global list.
- **Taxonomies** provide tagging/categorization. Tags can be used in content queries for filtering.
- **Macros** are expressions evaluated at runtime in various contexts (conditions, text fields, marketing rules).
- **Configuration keys** in `appsettings.json` control runtime behavior — the reference page is the definitive list.

## Related source code

| Area | Path |
|---|---|
| Website channel | `./resources/repositories/xperience/CMSSolution/Websites/Website/` |
| Headless channel | `./resources/repositories/xperience/CMSSolution/Headless/HeadlessChannel/` |
| Content workflow engine | `./resources/repositories/xperience/CMSSolution/ContentWorkflowEngine/` |
| Globalization (languages) | `./resources/repositories/xperience/CMSSolution/Globalization/` |
| Content engine taxonomy | `./resources/repositories/xperience/CMSSolution/ContentEngine/Taxonomy/` |
| Macro engine | `./resources/repositories/xperience/CMSSolution/MacroEngine/` |
| Email engine | `./resources/repositories/xperience/CMSSolution/EmailEngine/` |
| Media library | `./resources/repositories/xperience/CMSSolution/MediaLibrary/` |
| Event log | `./resources/repositories/xperience/CMSSolution/EventLog/` |
| Web farm sync | `./resources/repositories/xperience/CMSSolution/WebFarmSync/` |
| AIRA | `./resources/repositories/xperience/CMSSolution/AIRA/` |
| Notifications | `./resources/repositories/xperience/CMSSolution/Notifications/` |

## Cross-references

- Users/roles and permissions: [xperience skill — page-permissions](../../xperience/references/page-permissions.md)
- Website content (editor): [business-website-content.md](business-website-content.md)
- RTE (editor): [business-general.md](business-general.md) § Rich text editor
- Deployment: [dev-deployment-and-saas.md](dev-deployment-and-saas.md)
