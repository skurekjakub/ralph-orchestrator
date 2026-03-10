# Content and Channels

This reference covers the source roots that model content itself and the channels that deliver it: reusable content, website pages, headless delivery, media, synchronization, workflow, and workspaces.

## Major Paths

| Path | What it contains |
|---|---|
| `./resources/repositories/xperience/CMSSolution/ContentEngine/` | Channel-independent content model: content items, content types, reusable field schemas, queries, taxonomy, translation, versioning, synchronization hooks |
| `./resources/repositories/xperience/CMSSolution/Websites/` | Website-channel delivery: page tree, page content, Page Builder, page templates, URLs, ACLs, routing, recycle bin |
| `./resources/repositories/xperience/CMSSolution/Headless/` | Headless channels, headless items, tokens, query support |
| `./resources/repositories/xperience/CMSSolution/MediaLibrary/` | Shared media library files, libraries, services, cache integration |
| `./resources/repositories/xperience/CMSSolution/ContentSynchronization/` | Content sync session management, dependency discovery, restoration, permissions |
| `./resources/repositories/xperience/CMSSolution/ContentWorkflowEngine/` | Content workflow steps, roles, manager, notifications, workflow usage tracking |
| `./resources/repositories/xperience/CMSSolution/Workspaces/` | Workspace authorization and workspace-level permissions |

## Key Concepts

- `ContentEngine/` is the source root for reusable and structured content. It owns content items, content types, assets, folders, taxonomies, translation, and versioning.
- `Websites/` is the page-centric channel layer. It owns page trees, URLs, Page Builder, page templates, page ACLs, website domains, and website-specific queries.
- `Headless/` is a sibling channel surface, not a replacement for `ContentEngine/`. It wraps content delivery for headless use cases.
- `MediaLibrary/` is a separate file-based content surface distinct from content item assets in `ContentEngine/ContentItemAssets/`.
- Workflow and synchronization are layered concerns that sit beside the core content model rather than inside a single channel.
- `Workspaces/` appears to provide collaboration and authorization boundaries around content work.

## Important Entry Points

| Kind | Path | Why it matters |
|---|---|---|
| Content model | `./resources/repositories/xperience/CMSSolution/ContentEngine/ContentItem/` | Core content item domain |
| Content schema | `./resources/repositories/xperience/CMSSolution/ContentEngine/ContentTypes/` | Content type definitions and structure |
| Content queries | `./resources/repositories/xperience/CMSSolution/ContentEngine/Query/` | Primary data-access surface for content items |
| Website pages | `./resources/repositories/xperience/CMSSolution/Websites/WebPage/` | Core page domain for website channels |
| Page Builder | `./resources/repositories/xperience/CMSSolution/Websites/PageBuilder/` | Widget/section/template system for website editing |
| Website URLs | `./resources/repositories/xperience/CMSSolution/Websites/URLs/` | URL generation and URL-related behavior |
| Headless delivery | `./resources/repositories/xperience/CMSSolution/Headless/HeadlessItem/` | Headless item delivery surface |
| Media services | `./resources/repositories/xperience/CMSSolution/MediaLibrary/Services/` | Media library access and operations |
| Content sync | `./resources/repositories/xperience/CMSSolution/ContentSynchronization/Manager/` | Synchronization orchestration |
| Content workflow | `./resources/repositories/xperience/CMSSolution/ContentWorkflowEngine/WorkflowManager/` | Workflow orchestration and transitions |

## Cross-References

- Admin and web runtime: `source-admin-and-runtime.md`
- Marketing and engagement: `source-marketing-and-engagement.md`
- Commerce: `source-commerce.md`
- Existing deep topic: `page-permissions.md`
