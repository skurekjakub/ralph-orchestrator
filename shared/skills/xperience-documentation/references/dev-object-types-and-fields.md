# Object Types & Field Editor (Customization)

Custom object types let developers create new data entities (like custom modules) that live in the Xperience database with admin UI support. The field editor is the admin UI tool for managing data fields on content types and object types.

## Documentation pages

| Page | Path | What it covers |
|---|---|---|
| **Object types** (index) | `./src/_documentation/_documentation/developers-and-admins/customization/object-types.md` | Overview of the object type system; when to use object types vs. content types |
| Object type configuration | `./src/_documentation/_documentation/developers-and-admins/customization/object-types/object-type-configuration.md` | Configuring object type metadata, database mapping, CRUD operations |
| → (subfolder) | `./src/_documentation/_documentation/developers-and-admins/customization/object-types/object-type-configuration/` | Detailed object type configuration topics |
| Extend system object types | `./src/_documentation/_documentation/developers-and-admins/customization/object-types/extend-system-object-types.md` | Adding custom fields to built-in Xperience objects |
| Example: offices management | `./src/_documentation/_documentation/developers-and-admins/customization/object-types/example-offices-management-application.md` | End-to-end tutorial: building a custom module with object type, admin UI, and CRUD |
| **Field editor** (index) | `./src/_documentation/_documentation/developers-and-admins/customization/field-editor.md` | Using the field editor to add/edit fields on content types and object types |
| Data type management | `./src/_documentation/_documentation/developers-and-admins/customization/field-editor/data-type-management.md` | Registering custom data types for use in the field editor |

## Key concepts

- **Object types** are low-level data entities — they represent database tables with an Info class, Provider, and optional admin UI. They are used for system data (settings, custom modules, lookup tables) rather than content.
- **Content types** are higher-level and support channels, versioning, workflows. Most documentation tasks deal with content types, not object types.
- **Object type configuration** involves defining a `*Info` class, `*InfoProvider`, and decorating with `[InfoMapping]` attributes.
- **Extending system object types** adds custom fields to built-in objects (users, contacts, etc.) without modifying core code.
- The **field editor** is the admin UI for managing fields on both content types and object types. It supports adding fields, setting data types, configuring form components, and setting validation rules.
- **Custom data types** can be registered for use in the field editor beyond the built-in types.

## Related source code

| Area | Path |
|---|---|
| Data engine (object layer) | `./resources/repositories/xperience/CMSSolution/DataEngine/` |
| Modules | `./resources/repositories/xperience/CMSSolution/Modules/` |
| Form engine (fields) | `./resources/repositories/xperience/CMSSolution/FormEngine/` |
| Form info | `./resources/repositories/xperience/CMSSolution/FormEngine/FormInfo/` |

## Cross-references

- Content types (content-oriented modeling): [dev-content-types.md](dev-content-types.md)
- Admin UI pages (for custom module UIs): [dev-admin-ui.md](dev-admin-ui.md)
- ObjectQuery API: [dev-api.md](dev-api.md) § ObjectQuery API
- CI/CD (object type serialization): [dev-ci-cd.md](dev-ci-cd.md)
