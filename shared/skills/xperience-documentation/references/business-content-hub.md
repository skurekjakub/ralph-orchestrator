# Content Hub

The Content hub is the central application for managing reusable content items — structured content that exists independently of any channel (website, email, headless). Content editors use this application to create, organize, and manage content that can be linked from pages, emails, or headless channels.

## Documentation pages

| Page | Path | What it covers |
|---|---|---|
| **Content hub** (index) | `./src/_documentation/_documentation/business-users/content-hub.md` | Overview of the Content hub application, content item concepts, how items relate to channels |
| Content items | `./src/_documentation/_documentation/business-users/content-hub/content-items.md` | Creating, editing, publishing, and managing individual content items; language variants; workflow states |
| Content hub folders | `./src/_documentation/_documentation/business-users/content-hub/content-hub-folders.md` | Organizing content items into folders; folder hierarchy; moving items between folders |
| Content item assets | `./src/_documentation/_documentation/business-users/content-hub/content-item-assets.md` | Managing file assets (images, documents) attached to content items via content item asset fields |

## Key concepts

- **Content items** are instances of content types. They are channel-independent — a single content item can be linked from multiple pages, emails, or headless channels.
- **Content hub folders** provide organizational structure (not routing or URL structure — that's website content tree only).
- **Content item assets** are files stored directly on content items via asset fields, distinct from media library files.
- Content items support **language variants** — each item can have content in multiple configured languages.
- Content items follow **content versioning** rules (draft → published) and can be placed under **workflows** for approval processes.

## Related source code

| Area | Path |
|---|---|
| Content item core | `./resources/repositories/xperience/CMSSolution/ContentEngine/ContentItem/` |
| Content item assets | `./resources/repositories/xperience/CMSSolution/ContentEngine/ContentItemAssets/` |
| Content folders | `./resources/repositories/xperience/CMSSolution/ContentEngine/ContentFolder/` |
| Content type definitions | `./resources/repositories/xperience/CMSSolution/ContentEngine/ContentTypes/` |
| Content type management | `./resources/repositories/xperience/CMSSolution/ContentEngine/ContentTypeManagement/` |
| Smart folders | `./resources/repositories/xperience/CMSSolution/ContentEngine/SmartFolder/` |
| Admin Content hub UI | `./resources/repositories/xperience/CMSSolution/Admin/Kentico.Xperience.Admin.Base/` |

## Cross-references

- Content types (developer): [dev-content-types.md](dev-content-types.md)
- Content retrieval API: [dev-content-retrieval.md](dev-content-retrieval.md)
- Content item API: [dev-api.md](dev-api.md)
- Content versioning: [business-general.md](business-general.md) § Content versioning
