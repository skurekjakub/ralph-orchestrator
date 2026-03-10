# API (Developers and Admins)

The API section documents the programmatic interfaces for working with Xperience data — content item queries, the content retriever, ObjectQuery for generic objects, the management API, file system APIs, and external API usage.

## Documentation pages

| Page | Path | What it covers |
|---|---|---|
| **API** (index) | `./src/_documentation/_documentation/developers-and-admins/api.md` | Overview of available APIs; when to use which |

### Content item API

| Page | Path | What it covers |
|---|---|---|
| Content item API | `./src/_documentation/_documentation/developers-and-admins/api/content-item-api.md` | Overview of content item data access; query vs. retriever |
| Content item query API | `./src/_documentation/_documentation/developers-and-admins/api/content-item-api/content-item-query-api.md` | `ContentItemQueryBuilder` for querying content items; filtering, ordering, paging |
| Reference: content item query | `./src/_documentation/_documentation/developers-and-admins/api/content-item-api/reference-content-item-query.md` | Full API reference for content item query builder |
| Content retriever API | `./src/_documentation/_documentation/developers-and-admins/api/content-item-api/content-retriever-api.md` | `IContentRetriever` — simplified content querying API |
| Reference: content retriever API | `./src/_documentation/_documentation/developers-and-admins/api/content-item-api/reference-content-retriever-api.md` | Full API reference for content retriever |
| Content item database structure | `./src/_documentation/_documentation/developers-and-admins/api/content-item-api/content-item-database-structure.md` | Database table layout for content items; useful for debugging |
| Content item asset upload API | `./src/_documentation/_documentation/developers-and-admins/api/content-item-api/content-item-asset-upload-api.md` | Programmatically uploading file assets to content items |

### Other APIs

| Page | Path | What it covers |
|---|---|---|
| ObjectQuery API | `./src/_documentation/_documentation/developers-and-admins/api/objectquery-api.md` | Generic `ObjectQuery<T>` for querying any Info object (not content items) |
| Database table API | `./src/_documentation/_documentation/developers-and-admins/api/database-table-api.md` | Low-level database access; raw SQL queries |
| Management API | `./src/_documentation/_documentation/developers-and-admins/api/management-api.md` | REST management API for external system integrations |
| Files API and CMS IO | `./src/_documentation/_documentation/developers-and-admins/api/files-api-and-cms-io.md` | File system abstraction; CMS.IO |
| → File system providers | `./src/_documentation/_documentation/developers-and-admins/api/files-api-and-cms-io/file-system-providers.md` | Custom storage providers (Azure Blob, AWS S3) |
| → (subfolder) | `./src/_documentation/_documentation/developers-and-admins/api/files-api-and-cms-io/file-system-providers/` | Detailed provider implementation |
| Use the API externally | `./src/_documentation/_documentation/developers-and-admins/api/use-the-xperience-by-kentico-api-externally.md` | Using Xperience APIs from external applications (console apps, services) |
| Generate code files for system objects | `./src/_documentation/_documentation/developers-and-admins/api/generate-code-files-for-system-objects.md` | Code generation for system objects (not content types) |

## Key concepts

- **Content item query** (`ContentItemQueryBuilder`) is the primary data access API for content items. Use this for complex queries with joins, filters, and ordering.
- **Content retriever** (`IContentRetriever`) is a simplified API that wraps content item query — designed for common retrieval patterns with less boilerplate.
- **ObjectQuery** is the equivalent API for non-content objects (Info classes) — used for system data like users, roles, settings.
- **Management API** is a REST API for external integrations — CRUD operations on content and system objects from outside the Xperience application.
- **CMS IO** abstracts file system operations — enables transparent switching between local storage and cloud providers (Azure Blob, S3).
- **External API usage** documents how to reference Xperience assemblies from standalone applications (console apps, Azure Functions) for batch operations.

## Related source code

| Area | Path |
|---|---|
| Content item query | `./resources/repositories/xperience/CMSSolution/ContentEngine/Query/` |
| Content item data | `./resources/repositories/xperience/CMSSolution/ContentEngine/ContentItem/` |
| Content item assets | `./resources/repositories/xperience/CMSSolution/ContentEngine/ContentItemAssets/` |
| Data engine (ObjectQuery) | `./resources/repositories/xperience/CMSSolution/DataEngine/` |
| IO abstraction | `./resources/repositories/xperience/CMSSolution/IO/` |
| Headless API | `./resources/repositories/xperience/CMSSolution/Mvc/Kentico.Xperience.Headless/` |
| Code generators | `./resources/repositories/xperience/CMSSolution/ContentEngine/CodeGenerators/` |
| DB data manager | `./resources/repositories/xperience/CMSSolution/DbDataManager/` |

## Cross-references

- Content retrieval (higher-level): [dev-content-retrieval.md](dev-content-retrieval.md)
- Content types (data model): [dev-content-types.md](dev-content-types.md)
- Object types: [dev-object-types-and-fields.md](dev-object-types-and-fields.md)
- Caching query results: [dev-caching.md](dev-caching.md)
