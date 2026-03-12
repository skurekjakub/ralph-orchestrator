# Website Content

The Website content application is where content editors manage the page tree for a website channel — creating pages, editing content via Page Builder, managing URLs, translating pages, and controlling page-level permissions.

## Documentation pages

| Page | Path | What it covers |
|---|---|---|
| **Website content** (index) | `./src/_documentation/_documentation/business-users/website-content.md` | Overview of the website content tree, page concepts, channel relationship |
| Create pages | `./src/_documentation/_documentation/business-users/website-content/create-pages.md` | Creating new pages and folders in the content tree; selecting page content types |
| Edit and publish pages | `./src/_documentation/_documentation/business-users/website-content/edit-and-publish-pages.md` | Editing page content, using Page Builder, publishing workflow (draft → published), scheduling |
| Delete pages | `./src/_documentation/_documentation/business-users/website-content/delete-pages.md` | Deleting pages; impact on child pages; recycle bin recovery |
| Manage page URLs | `./src/_documentation/_documentation/business-users/website-content/manage-page-urls.md` | URL slugs, URL paths, custom URLs, URL redirects from the editor perspective |
| Page templates | `./src/_documentation/_documentation/business-users/website-content/page-templates.md` | Using and applying page templates from the editor UI |
| Widgets and page builder | `./src/_documentation/_documentation/business-users/website-content/widgets-and-page-builder.md` | Using the Page Builder to add widgets, configure sections, edit content visually |
| Translate pages | `./src/_documentation/_documentation/business-users/website-content/translate-pages.md` | Creating language variants of pages; translation workflow |
| Secure pages | `./src/_documentation/_documentation/business-users/website-content/secure-pages.md` | Page-level ACL permissions; securing pages for specific roles |
| Track page usages | `./src/_documentation/_documentation/business-users/website-content/track-page-usages.md` | Viewing where a page or content item is referenced across the system |

## Key concepts

- **Content tree** is the hierarchical structure of pages within a website channel. Tree position determines URL paths (when using content tree-based routing).
- **Pages** are content items bound to a website channel. They combine structured content fields with visual layout via **Page Builder** (editable areas, sections, widgets).
- **Page templates** save a Page Builder layout configuration for reuse across multiple pages.
- **Page ACLs** control which admin users can read, create, update, delete, or synchronize specific pages. See the [xperience skill's page-permissions reference](../../xperience/references/page-permissions.md) for the full three-layer permission model.
- **URL management** includes automatic tree-based slugs and manual URL customization.
- **Language variants** allow each page to exist in multiple languages configured on the website channel.

## Related source code

| Area | Path |
|---|---|
| Web page core | `./resources/repositories/xperience/CMSSolution/Websites/WebPage/` |
| Web page manager | `./resources/repositories/xperience/CMSSolution/Websites/WebPageManager/` |
| Web page publisher | `./resources/repositories/xperience/CMSSolution/Websites/WebPagePublisher/` |
| Web page content | `./resources/repositories/xperience/CMSSolution/Websites/WebPageContent/` |
| Page Builder | `./resources/repositories/xperience/CMSSolution/Websites/PageBuilder/` |
| Visual Builder | `./resources/repositories/xperience/CMSSolution/Websites/VisualBuilder/` |
| Page templates | `./resources/repositories/xperience/CMSSolution/Websites/Templates/` |
| URL handling | `./resources/repositories/xperience/CMSSolution/Websites/URLs/` |
| Page ACLs | `./resources/repositories/xperience/CMSSolution/Websites/ACLs/` |
| Routing | `./resources/repositories/xperience/CMSSolution/Websites/Routing/` |
| Web page folders | `./resources/repositories/xperience/CMSSolution/Websites/WebPageFolder/` |
| Website channel | `./resources/repositories/xperience/CMSSolution/Websites/Website/` |
| Admin websites UI | `./resources/repositories/xperience/CMSSolution/Admin/Kentico.Xperience.Admin.Websites/` |

## Cross-references

- Page permissions model (deep reference): [xperience skill — page-permissions](../../xperience/references/page-permissions.md)
- Page Builder development: [dev-builders.md](dev-builders.md)
- Content tree-based routing: [dev-routing.md](dev-routing.md)
- Website channel configuration: [dev-configuration.md](dev-configuration.md) § Website channel management
