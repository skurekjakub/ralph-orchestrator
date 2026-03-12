# General Features (Business Users)

This reference covers the standalone business-user documentation pages that don't belong to the larger grouped sections (content hub, website content, digital marketing, media libraries).

## Documentation pages

| Page | Path | What it covers |
|---|---|---|
| AIRA | `./src/_documentation/_documentation/business-users/aira.md` | AI-powered assistant (AIRA) features — content suggestions, translation assistance, AI-driven content operations |
| Content sync | `./src/_documentation/_documentation/business-users/content-sync.md` | Synchronizing content items between environments (e.g., staging → production) |
| Content versioning | `./src/_documentation/_documentation/business-users/content-versioning.md` | Draft/published versioning model; version history; restoring previous versions |
| Email queue | `./src/_documentation/_documentation/business-users/email-queue.md` | Monitoring and managing the email sending queue |
| Headless content | `./src/_documentation/_documentation/business-users/headless-content.md` | Managing content delivered via headless channels (API-served content not tied to a website) |
| Manage commerce stores | `./src/_documentation/_documentation/business-users/manage-commerce-stores.md` | Business-user guide for managing online stores; viewing orders and products |
| Manage your user profile | `./src/_documentation/_documentation/business-users/manage-your-user-profile.md` | Admin user profile settings; changing password; personal preferences |
| Members | `./src/_documentation/_documentation/business-users/members.md` | Managing site members (front-end registered users) from the admin UI |
| Recycle bin | `./src/_documentation/_documentation/business-users/recycle_bin.md` | Recovering deleted pages and content items from the recycle bin |
| Rich text editor | `./src/_documentation/_documentation/business-users/rich-text-editor.md` | Using the rich text editor; toolbar features; inserting links, images, macros |
| Administration interface basics | `./src/_documentation/_documentation/administration-interface-basics.md` | General admin UI navigation, dashboard, application list (top-level page) |

## Key concepts

- **Content versioning** is the draft → published lifecycle. All content items (pages, reusable content, headless, emails) go through this. Workflows layer approval steps on top.
- **Content sync** moves content between environments via export/import packages.
- **Headless content** is managed in headless channels and served via the headless REST API — no page tree, no Page Builder.
- **Members** are front-end (live site) users registered via member registration. They are distinct from **admin users** who access the admin UI.
- **AIRA** is the AI assistant integrated into the admin UI for content editing assistance.
- **Recycle bin** is available per-channel and allows recovery of deleted pages/items within a retention period.

## Related source code

| Area | Path |
|---|---|
| Content versioning | `./resources/repositories/xperience/CMSSolution/ContentEngine/Version/` |
| Content sync | `./resources/repositories/xperience/CMSSolution/ContentSynchronization/` |
| Headless channels | `./resources/repositories/xperience/CMSSolution/Headless/` |
| Membership | `./resources/repositories/xperience/CMSSolution/Membership/` |
| Recycle bin (websites) | `./resources/repositories/xperience/CMSSolution/Websites/RecycleBin/` |
| Recycle bin (content engine) | `./resources/repositories/xperience/CMSSolution/ContentEngine/RecycleBin/` |
| AIRA | `./resources/repositories/xperience/CMSSolution/AIRA/` |
| Commerce | `./resources/repositories/xperience/CMSSolution/Commerce/` |
| Email engine | `./resources/repositories/xperience/CMSSolution/EmailEngine/` |

## Cross-references

- Content versioning configuration: [dev-configuration.md](dev-configuration.md) § Content versioning configuration
- Content sync configuration: [dev-configuration.md](dev-configuration.md) § Content sync configuration
- Headless channel management: [dev-configuration.md](dev-configuration.md) § Headless channel management
- Authentication & membership: [dev-auth.md](dev-auth.md)
- Digital commerce setup: [dev-digital-commerce.md](dev-digital-commerce.md)
- RTE configuration: [dev-configuration.md](dev-configuration.md) § Rich text editor configuration
- AIRA configuration: [dev-configuration.md](dev-configuration.md) § AIRA configuration
