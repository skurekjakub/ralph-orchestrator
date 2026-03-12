# Media Libraries

Media libraries manage shared files (images, documents, videos) that can be used across the system — in content items, on pages via widgets, or linked from emails.

## Documentation pages

| Page | Path | What it covers |
|---|---|---|
| **Media libraries** (index) | `./src/_documentation/_documentation/business-users/media-libraries.md` | Overview of media library concepts; difference from content item assets |
| Create media libraries | `./src/_documentation/_documentation/business-users/media-libraries/create-media-libraries.md` | Creating new media libraries; library settings and permissions |
| Manage media files | `./src/_documentation/_documentation/business-users/media-libraries/manage-media-files.md` | Uploading, organizing, editing metadata, and deleting media files |

## Key concepts

- **Media libraries** are collections of files stored on disk (or cloud storage via custom file system providers). They predate content item assets and serve a different use case — shared file repositories vs. per-item file attachments.
- Media files have metadata (title, description) and can be organized in folder structures within each library.
- Media files are served via direct URLs and can be referenced from rich text fields, widgets, or code.
- Media libraries are separate from **content item assets** — assets are tied to a specific content item, while media library files are shared across the system.

## Related source code

| Area | Path |
|---|---|
| Media library core | `./resources/repositories/xperience/CMSSolution/MediaLibrary/` |
| Media library files | `./resources/repositories/xperience/CMSSolution/MediaLibrary/Files/` |
| Media library assets | `./resources/repositories/xperience/CMSSolution/MediaLibrary/Assets/` |
| Media library services | `./resources/repositories/xperience/CMSSolution/MediaLibrary/Services/` |

## Cross-references

- Retrieving media in code: [dev-content-retrieval.md](dev-content-retrieval.md) § Retrieve content from media libraries
- Media library configuration: [dev-configuration.md](dev-configuration.md) § Media library configuration
- File system providers (custom storage): [dev-api.md](dev-api.md) § Files API and CMS IO
