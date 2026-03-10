# Content Retrieval (Development)

Content retrieval covers how developers query and display content on the live site — pages, reusable content items, headless content, and media library files.

## Documentation pages

| Page | Path | What it covers |
|---|---|---|
| **Content retrieval** (index) | `./src/_documentation/_documentation/developers-and-admins/development/content-retrieval.md` | Overview of content retrieval approaches; when to use which API |
| Retrieve page content | `./src/_documentation/_documentation/developers-and-admins/development/content-retrieval/retrieve-page-content.md` | Querying pages for a website channel; page content in views |
| → Retrieve page URLs | `./src/_documentation/_documentation/developers-and-admins/development/content-retrieval/retrieve-page-content/retrieve-page-urls.md` | Getting URL paths for pages (link generation) |
| Retrieve content items | `./src/_documentation/_documentation/developers-and-admins/development/content-retrieval/retrieve-content-items.md` | Querying reusable content items from the Content hub |
| Retrieve headless content | `./src/_documentation/_documentation/developers-and-admins/development/content-retrieval/retrieve-headless-content.md` | Querying headless channel content |
| Retrieve content from media libraries | `./src/_documentation/_documentation/developers-and-admins/development/content-retrieval/retrieve-content-from-media-libraries.md` | Getting media library file URLs and metadata |

## Key concepts

- **Content retrieval API** is the primary way to query content. It uses generated strongly-typed classes and supports filtering, ordering, language selection, and linked items.
- **Page content retrieval** targets a specific website channel and returns pages with their content fields plus Page Builder data.
- **Reusable content items** and **headless content** are retrieved via the same content item query API but scoped to different channels.
- **URL retrieval** uses `IWebPageUrlRetriever` to get page URLs — important for generating links in views and navigation.
- **Media library files** are retrieved via their direct URL or through `MediaFileUrl` helpers.
- All retrieval APIs integrate with the **caching layer** — see [dev-caching.md](dev-caching.md).

## Related source code

| Area | Path |
|---|---|
| Content item query | `./resources/repositories/xperience/CMSSolution/ContentEngine/Query/` |
| Website page query | `./resources/repositories/xperience/CMSSolution/Websites/Query/` |
| Headless query | `./resources/repositories/xperience/CMSSolution/Headless/Query/` |
| Content retriever (MVC) | `./resources/repositories/xperience/CMSSolution/Mvc/Kentico.Content.Web.Mvc/` |
| Media library services | `./resources/repositories/xperience/CMSSolution/MediaLibrary/Services/` |
| Web page URLs | `./resources/repositories/xperience/CMSSolution/Websites/URLs/` |
| Content item references | `./resources/repositories/xperience/CMSSolution/ContentEngine/ContentItemReference/` |

## Cross-references

- Content item API (lower level): [dev-api.md](dev-api.md) § Content item API
- Caching retrieved content: [dev-caching.md](dev-caching.md)
- Content types (data model): [dev-content-types.md](dev-content-types.md)
- Routing (URL resolution): [dev-routing.md](dev-routing.md)
