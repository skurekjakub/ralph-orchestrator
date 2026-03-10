# Content Types (Development)

Content types define the data model for all content in Xperience — pages, reusable content items, headless items, and emails. This is a foundational area: virtually every documentation task involves content types.

## Documentation pages

| Page | Path | What it covers |
|---|---|---|
| **Content types** (index) | `./src/_documentation/_documentation/developers-and-admins/development/content-types.md` | Content type concepts; page vs. reusable vs. headless vs. email content types; field types; creating and managing content types |
| Reusable field schemas | `./src/_documentation/_documentation/developers-and-admins/development/content-types/reusable-field-schemas.md` | Defining reusable groups of fields that can be shared across multiple content types |
| Limit the pages users can create | `./src/_documentation/_documentation/developers-and-admins/development/content-types/limit-the-pages-users-can-create.md` | Configuring allowed child page types in the content tree; controlling which content types can be created under which parent |
| Content types MCP | `./src/_documentation/_documentation/developers-and-admins/development/content-types/content-types-mcp.md` | MCP (Model Context Protocol) server support for content type operations |

## Key concepts

- **Four content type categories**: Page (bound to website channel content tree), Reusable (channel-independent, managed in Content hub), Headless (served via headless API), Email (used for email campaigns).
- **Fields** define the data schema — each field has a data type (text, number, asset, content item reference, etc.) and display settings.
- **Reusable field schemas** group fields that appear on multiple content types — change the schema once, all content types update.
- **Content type code generation** produces strongly-typed C# classes for each content type (used in content retrieval).
- Content types are defined in the admin UI and stored in the database. CI/CD serializes them to XML for version control.
- **Allowed child types** restrict which page content types can be created as children under a given parent type in the content tree.

## Related source code

| Area | Path |
|---|---|
| Content types core | `./resources/repositories/xperience/CMSSolution/ContentEngine/ContentTypes/` |
| Content type management | `./resources/repositories/xperience/CMSSolution/ContentEngine/ContentTypeManagement/` |
| Reusable field schemas | `./resources/repositories/xperience/CMSSolution/ContentEngine/ReusableFieldSchemas/` |
| Code generators | `./resources/repositories/xperience/CMSSolution/ContentEngine/CodeGenerators/` |
| Form engine (field types) | `./resources/repositories/xperience/CMSSolution/FormEngine/` |

## Cross-references

- Content hub (business): [business-content-hub.md](business-content-hub.md)
- Content retrieval API: [dev-content-retrieval.md](dev-content-retrieval.md)
- Content item API: [dev-api.md](dev-api.md) § Content item API
- Field editor customization: [dev-object-types-and-fields.md](dev-object-types-and-fields.md) § Field editor
- CI/CD serialization: [dev-ci-cd.md](dev-ci-cd.md)
