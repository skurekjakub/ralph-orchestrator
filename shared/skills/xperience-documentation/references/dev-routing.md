# Routing (Development)

Routing documentation covers how URL requests are mapped to pages in the content tree and how redirects are managed.

## Documentation pages

| Page | Path | What it covers |
|---|---|---|
| **Routing** (index) | `./src/_documentation/_documentation/developers-and-admins/development/routing.md` | Overview of routing approaches in Xperience |
| Content tree-based routing | `./src/_documentation/_documentation/developers-and-admins/development/routing/content-tree-based-routing.md` | How page URLs are derived from their position in the content tree |
| → Enable content tree-based routing | `./src/_documentation/_documentation/developers-and-admins/development/routing/content-tree-based-routing/enable-content-tree-based-routing.md` | Registering routing middleware; Startup.cs configuration |
| → Set up content tree-based routing | `./src/_documentation/_documentation/developers-and-admins/development/routing/content-tree-based-routing/set-up-content-tree-based-routing.md` | Creating route handlers for page content types; mapping content types to views |
| Custom redirects | `./src/_documentation/_documentation/developers-and-admins/development/routing/custom-redirects.md` | Implementing custom redirect rules |
| Configure forbidden URL characters | `./src/_documentation/_documentation/developers-and-admins/development/routing/configure-forbidden-url-characters.md` | Restricting characters allowed in page URL slugs |

## Key concepts

- **Content tree-based routing** maps the page's position in the content tree to a URL path (e.g., `/Products/Laptops/ThinkPad` mirrors the tree hierarchy). This is the primary routing model.
- Routing uses ASP.NET Core middleware. The `MapKentico()` call registers the content tree route handler.
- Each page content type needs a **route handler** — a controller or view that renders the page based on its content type.
- **URL slugs** are configurable per-page and auto-generated from page names. Forbidden characters can be restricted globally.
- **Custom redirects** allow rules beyond the built-in tree path mapping.

## Related source code

| Area | Path |
|---|---|
| Routing (website) | `./resources/repositories/xperience/CMSSolution/Websites/Routing/` |
| Routing.Web | `./resources/repositories/xperience/CMSSolution/Routing.Web/` |
| URL handling | `./resources/repositories/xperience/CMSSolution/Websites/URLs/` |
| Path matching | `./resources/repositories/xperience/CMSSolution/Websites/PathMatch/` |
| Domain configuration | `./resources/repositories/xperience/CMSSolution/Websites/Domains/` |

## Cross-references

- URL management from editor perspective: [business-website-content.md](business-website-content.md) § Manage page URLs
- Website channel configuration: [dev-configuration.md](dev-configuration.md) § Website channel management
- Content retrieval (page URLs): [dev-content-retrieval.md](dev-content-retrieval.md) § Retrieve page URLs
