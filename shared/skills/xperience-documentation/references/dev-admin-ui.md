# Admin UI Extension (Customization)

Extending the Xperience administration interface — custom UI pages, form components, editing components, localization, and admin UI testing.

## Documentation pages

| Page | Path | What it covers |
|---|---|---|
| **Extend the administration interface** (index) | `./src/_documentation/_documentation/developers-and-admins/customization/extend-the-administration-interface.md` | Overview of the admin UI extensibility model |
| Admin UI customization model overview | `./src/_documentation/_documentation/developers-and-admins/customization/extend-the-administration-interface/admin-ui-customization-model-overview.md` | Architecture of the admin UI (React client + .NET backend); how customization points work |
| Prepare your environment for admin development | `./src/_documentation/_documentation/developers-and-admins/customization/extend-the-administration-interface/prepare-your-environment-for-admin-development.md` | Setting up the development environment for admin UI customization (React tooling, build pipeline) |
| **UI pages** (index) | `./src/_documentation/_documentation/developers-and-admins/customization/extend-the-administration-interface/ui-pages.md` | Overview of custom admin pages |
| UI application pages | `./src/_documentation/_documentation/developers-and-admins/customization/extend-the-administration-interface/ui-pages/ui-application-pages.md` | Creating top-level application pages in the admin navigation |
| UI pages with forms | `./src/_documentation/_documentation/developers-and-admins/customization/extend-the-administration-interface/ui-pages/ui-pages-with-forms.md` | Pages that contain edit forms |
| UI page commands | `./src/_documentation/_documentation/developers-and-admins/customization/extend-the-administration-interface/ui-pages/ui-page-commands.md` | Adding action buttons/commands to admin pages |
| UI page extenders | `./src/_documentation/_documentation/developers-and-admins/customization/extend-the-administration-interface/ui-pages/ui-page-extenders.md` | Extending built-in admin pages without replacing them |
| UI page permission checks | `./src/_documentation/_documentation/developers-and-admins/customization/extend-the-administration-interface/ui-pages/ui-page-permission-checks.md` | Adding permission checks to custom admin pages |
| Reference: UI page templates | `./src/_documentation/_documentation/developers-and-admins/customization/extend-the-administration-interface/ui-pages/reference-ui-page-templates.md` | Built-in page template reference for admin pages |
| → (subfolder) | `./src/_documentation/_documentation/developers-and-admins/customization/extend-the-administration-interface/ui-pages/reference-ui-page-templates/` | Detailed template reference pages |
| **UI form components** (index) | `./src/_documentation/_documentation/developers-and-admins/customization/extend-the-administration-interface/ui-form-components.md` | Overview of form components in the admin |
| Reference: Admin UI form components | `./src/_documentation/_documentation/developers-and-admins/customization/extend-the-administration-interface/ui-form-components/reference-admin-ui-form-components.md` | Built-in admin form component reference |
| Reference: React input components | `./src/_documentation/_documentation/developers-and-admins/customization/extend-the-administration-interface/ui-form-components/reference-react-input-components.md` | React-level input component reference for custom form components |
| Example: color selector | `./src/_documentation/_documentation/developers-and-admins/customization/extend-the-administration-interface/ui-form-components/example-color-selector-ui-form-component.md` | Step-by-step tutorial: building a color selector form component |
| Validation rules | `./src/_documentation/_documentation/developers-and-admins/customization/extend-the-administration-interface/ui-form-components/ui-form-component-validation-rules.md` | Creating custom admin form validation rules |
| Visibility conditions | `./src/_documentation/_documentation/developers-and-admins/customization/extend-the-administration-interface/ui-form-components/ui-form-component-visibility-conditions.md` | Conditionally showing/hiding form fields in the admin |
| Reference extractors | `./src/_documentation/_documentation/developers-and-admins/customization/extend-the-administration-interface/ui-form-components/ui-form-component-reference-extractors.md` | Extracting object references from form component values (for dependency tracking) |
| **Editing components** (index) | `./src/_documentation/_documentation/developers-and-admins/customization/extend-the-administration-interface/ui-form-components/editing-components.md` | Overview of editing components (inline editors for builder widgets) |
| → (subfolder) | `./src/_documentation/_documentation/developers-and-admins/customization/extend-the-administration-interface/ui-form-components/editing-components/` | Detailed editing component development |
| Admin UI localization | `./src/_documentation/_documentation/developers-and-admins/customization/admin-ui-localization.md` | Localizing custom admin UI elements |
| Admin UI tests | `./src/_documentation/_documentation/developers-and-admins/customization/extend-the-administration-interface/administration-interface-ui-tests.md` | Testing custom admin UI components |

## Key concepts

- The admin UI uses a **React + .NET hybrid architecture**: the client app is React (TypeScript), the backend is ASP.NET Core. Customizations span both layers.
- **UI pages** are the primary extension point — each page is a C# class backed by a React template. Pages are registered in the admin navigation tree.
- **UI form components** are reusable input editors used in content type fields, builder properties, and admin forms. They have a C# server model + React client component.
- **Editing components** are inline editors that appear directly in the Page Builder visual editing mode (clicking on widget content to edit it in-place).
- **UI page extenders** let you modify built-in admin pages (add tabs, columns, commands) without replacing them entirely.

## Related source code

| Area | Path |
|---|---|
| Admin base | `./resources/repositories/xperience/CMSSolution/Admin/Kentico.Xperience.Admin.Base/` |
| Admin client (React) | `./resources/repositories/xperience/CMSSolution/Admin/Client/` |
| Admin shared (MVC) | `./resources/repositories/xperience/CMSSolution/Mvc/Kentico.Xperience.Admin.Base.Shared/` |

## Cross-references

- Builder properties (use form components): [dev-builders.md](dev-builders.md) § Component properties
- Object types (custom applications): [dev-object-types-and-fields.md](dev-object-types-and-fields.md)
- Configuration: users/roles (admin access): [dev-configuration.md](dev-configuration.md) § Users
