# Caching (Development)

Caching documentation covers the multi-layer caching system in Xperience — data caching for content queries, output caching for rendered responses, file caching, and the cache dependency/invalidation mechanism.

## Documentation pages

| Page | Path | What it covers |
|---|---|---|
| **Caching** (index) | `./src/_documentation/_documentation/developers-and-admins/development/caching.md` | Overview of caching layers; when to use each |
| Data caching | `./src/_documentation/_documentation/developers-and-admins/development/caching/data-caching.md` | Caching content query results using `IProgressiveCache`; cache keys; cache durations |
| Output caching | `./src/_documentation/_documentation/developers-and-admins/development/caching/output-caching.md` | Response-level output caching for page views; vary-by parameters |
| File caching | `./src/_documentation/_documentation/developers-and-admins/development/caching/file-caching.md` | Caching file system reads; media library file caching |
| Cache dependencies | `./src/_documentation/_documentation/developers-and-admins/development/caching/cache-dependencies.md` | Setting cache dependencies so caches invalidate when content changes |
| Cache dependencies reference | `./src/_documentation/_documentation/developers-and-admins/development/caching/cache-dependencies-reference.md` | Full reference of cache dependency key patterns (by content type, by page, by media, etc.) |

## Key concepts

- **Data caching** wraps content retrieval in `IProgressiveCache.LoadAsync()`. Results are cached by key and invalidated via cache dependencies.
- **Cache dependencies** are string keys that represent data state. When content changes, the system touches the relevant dependency keys, invalidating all caches that declared those dependencies. The **reference page** lists all built-in dependency key patterns.
- **Output caching** uses ASP.NET Core response caching middleware, extended by Xperience's cache dependency integration.
- **File caching** caches reads from disk/storage, primarily for media files.
- Caching is **critical for performance** — all content retrieval should be cached in production.

## Related source code

| Area | Path |
|---|---|
| Website cache | `./resources/repositories/xperience/CMSSolution/Websites/Cache/` |
| Website cache dependency builder | `./resources/repositories/xperience/CMSSolution/Websites/CacheDependencyBuilder/` |
| Content engine cache dependency builder | `./resources/repositories/xperience/CMSSolution/ContentEngine/CacheDependencyBuilder/` |
| Core caching | `./resources/repositories/xperience/CMSSolution/Core/` (look for cache-related classes) |
| MVC caching integration | `./resources/repositories/xperience/CMSSolution/Mvc/Kentico.Content.Web.Mvc/` |

## Cross-references

- Content retrieval (what gets cached): [dev-content-retrieval.md](dev-content-retrieval.md)
- Output caching configuration: [dev-configuration.md](dev-configuration.md) § Settings
