# Admin and Web Runtime

This reference covers the application surfaces that expose Xperience to users and developers: the admin UI projects, ASP.NET Core MVC/runtime packages, routing host layer, membership runtime integration, and AIRA.

## Major Paths

| Path | What it contains |
|---|---|
| `./resources/repositories/xperience/CMSSolution/Admin/` | Admin applications and admin-client code for websites, headless, digital marketing, digital commerce, and shared admin infrastructure |
| `./resources/repositories/xperience/CMSSolution/Mvc/` | ASP.NET Core runtime packages for content delivery, website integration, headless access, membership, online marketing web support, and shared admin MVC pieces |
| `./resources/repositories/xperience/CMSSolution/Routing.Web/` | Web-host routing integration layer |
| `./resources/repositories/xperience/CMSSolution/Membership/` | Member authentication, roles, users, and application permission surfaces |
| `./resources/repositories/xperience/CMSSolution/AIRA/` | AIRA-specific assets, attachments, conversations, and module wiring |

## Key Concepts

- `Admin/` is split by product surface: shared admin base plus websites, headless, digital marketing, and digital commerce admin apps.
- `Admin/Client/` indicates a client-side admin layer distinct from the server projects.
- `Mvc/` is the public runtime and integration surface for developers building Xperience sites on ASP.NET Core.
- `Routing.Web/` is small but important because it connects routing behavior into the host web runtime.
- `Membership/` bridges authentication/authorization concerns into the application and live-site member model.
- `AIRA/` is its own feature root rather than a small folder under admin, which suggests a distinct subsystem with dedicated data and assets.

## Important Entry Points

| Kind | Path | Why it matters |
|---|---|---|
| Admin client | `./resources/repositories/xperience/CMSSolution/Admin/Client/` | Client-side admin UI layer |
| Shared admin base | `./resources/repositories/xperience/CMSSolution/Admin/Kentico.Xperience.Admin.Base/` | Core admin infrastructure shared by admin applications |
| Websites admin | `./resources/repositories/xperience/CMSSolution/Admin/Kentico.Xperience.Admin.Websites/` | Website-focused admin application |
| Marketing admin | `./resources/repositories/xperience/CMSSolution/Admin/Kentico.Xperience.Admin.DigitalMarketing/` | Marketing-focused admin application |
| Commerce admin | `./resources/repositories/xperience/CMSSolution/Admin/Kentico.Xperience.Admin.DigitalCommerce/` | Commerce-focused admin application |
| Web runtime | `./resources/repositories/xperience/CMSSolution/Mvc/Kentico.Web.Mvc/` | Core ASP.NET Core runtime integration |
| Content runtime | `./resources/repositories/xperience/CMSSolution/Mvc/Kentico.Content.Web.Mvc/` | Content delivery and content-query runtime layer |
| Headless runtime | `./resources/repositories/xperience/CMSSolution/Mvc/Kentico.Xperience.Headless/` | Headless runtime package |
| Membership runtime | `./resources/repositories/xperience/CMSSolution/Mvc/Kentico.Membership/` | Membership integration into the ASP.NET Core runtime |
| Routing host layer | `./resources/repositories/xperience/CMSSolution/Routing.Web/` | Web-host routing glue |
| AIRA module | `./resources/repositories/xperience/CMSSolution/AIRA/Module/` | AIRA subsystem registration point |

## Cross-References

- Content and channels: `source-content-and-channels.md`
- Platform foundations: `source-solution-foundations.md`
- Marketing and engagement: `source-marketing-and-engagement.md`
