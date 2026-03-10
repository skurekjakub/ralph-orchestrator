# Builders (Development)

The builders documentation covers the three visual builder systems in Xperience: **Page Builder** (website pages), **Form Builder** (online forms), and **Email Builder** (email campaigns). They share a component architecture (widgets, sections, properties) but serve different channels.

## Documentation pages — Page Builder

| Page | Path | What it covers |
|---|---|---|
| **Builders** (index) | `./src/_documentation/_documentation/developers-and-admins/development/builders.md` | Overview of all three builder systems; shared concepts (component properties, visibility, validation) |
| Component properties visibility and validation | `./src/_documentation/_documentation/developers-and-admins/development/builders/builder-component-properties-visibility-and-validation.md` | Controlling when properties appear and how they validate across all builders |
| Bundle static assets | `./src/_documentation/_documentation/developers-and-admins/development/builders/bundle-static-assets-of-builder-components.md` | Bundling CSS/JS for builder components |
| Distribute builder components | `./src/_documentation/_documentation/developers-and-admins/development/builders/distribute-builder-components.md` | Packaging components as NuGet packages for reuse |
| **Page Builder** (index) | `./src/_documentation/_documentation/developers-and-admins/development/builders/page-builder.md` | Page Builder architecture; editable areas, sections, widgets |
| Create pages with editable areas | `./src/_documentation/_documentation/developers-and-admins/development/builders/page-builder/create-pages-with-editable-areas.md` | Defining editable areas in page views; area configuration |
| Widgets for Page Builder | `./src/_documentation/_documentation/developers-and-admins/development/builders/page-builder/widgets-for-page-builder.md` | Developing custom widgets (view components with properties) |
| → (subfolder) | `./src/_documentation/_documentation/developers-and-admins/development/builders/page-builder/widgets-for-page-builder/` | Detailed widget development (if deeper pages exist) |
| Sections for Page Builder | `./src/_documentation/_documentation/developers-and-admins/development/builders/page-builder/sections-for-page-builder.md` | Developing custom sections (layout containers for widgets) |
| → (subfolder) | `./src/_documentation/_documentation/developers-and-admins/development/builders/page-builder/sections-for-page-builder/` | Detailed section development |
| Page templates for Page Builder | `./src/_documentation/_documentation/developers-and-admins/development/builders/page-builder/page-templates-for-page-builder.md` | Creating page templates that save builder layouts for reuse |
| → (subfolder) | `./src/_documentation/_documentation/developers-and-admins/development/builders/page-builder/page-templates-for-page-builder/` | Detailed template development |
| Reference: default widgets | `./src/_documentation/_documentation/developers-and-admins/development/builders/page-builder/reference-default-page-builder-widgets.md` | Built-in widget reference |
| Render widgets in code | `./src/_documentation/_documentation/developers-and-admins/development/builders/page-builder/render-widgets-in-code.md` | Programmatic widget rendering outside Page Builder |

## Documentation pages — Form Builder

| Page | Path | What it covers |
|---|---|---|
| **Form Builder** (index) | `./src/_documentation/_documentation/developers-and-admins/development/builders/form-builder.md` | Form Builder architecture; form components, sections, validation |
| Form components | `./src/_documentation/_documentation/developers-and-admins/development/builders/form-builder/form-components.md` | Developing custom form input components |
| → (subfolder) | `./src/_documentation/_documentation/developers-and-admins/development/builders/form-builder/form-components/` | Detailed form component development |
| Form sections | `./src/_documentation/_documentation/developers-and-admins/development/builders/form-builder/form-sections.md` | Developing custom form layout sections |
| → (subfolder) | `./src/_documentation/_documentation/developers-and-admins/development/builders/form-builder/form-sections/` | Detailed form section development |
| Form widget customization | `./src/_documentation/_documentation/developers-and-admins/development/builders/form-builder/form-widget-customization.md` | Customizing the form widget rendered on pages |
| Validation rules | `./src/_documentation/_documentation/developers-and-admins/development/builders/form-builder/form-builder-validation-rules.md` | Creating custom form validation rules |
| Reference: form components | `./src/_documentation/_documentation/developers-and-admins/development/builders/form-builder/reference-form-builder-components.md` | Built-in form component reference |

## Documentation pages — Email Builder

| Page | Path | What it covers |
|---|---|---|
| **Email Builder** (index) | `./src/_documentation/_documentation/developers-and-admins/development/builders/email-builder.md` | Email Builder architecture; email builder components |
| Develop email builder components | `./src/_documentation/_documentation/developers-and-admins/development/builders/email-builder/develop-email-builder-components.md` | Creating custom email builder widgets |
| Inline editors for email widgets | `./src/_documentation/_documentation/developers-and-admins/development/builders/email-builder/inline-editors-email-builder-widgets.md` | Adding inline editing to email widgets |

## Key concepts

- All three builders share a **component model**: widgets (content/functionality), sections (layout), properties (configuration), and property editors.
- **Page Builder** uses a **view component** architecture — each widget is an ASP.NET Core view component. The layout is stored as JSON in the page's builder configuration.
- **Editable areas** are named zones in page views where editors can place sections and widgets.
- **Form Builder** produces HTML forms with server-side validation. Form submissions create contact activities and can be exported.
- **Email Builder** produces email-safe HTML. Components must follow email HTML constraints (table layouts, inline styles).
- Component **properties** use the same form component system across all builders — property editors are reusable.

## Related source code

| Area | Path |
|---|---|
| Page Builder (website) | `./resources/repositories/xperience/CMSSolution/Websites/PageBuilder/` |
| Visual Builder (website) | `./resources/repositories/xperience/CMSSolution/Websites/VisualBuilder/` |
| Visual Builder (content engine) | `./resources/repositories/xperience/CMSSolution/ContentEngine/VisualBuilder/` |
| Form engine | `./resources/repositories/xperience/CMSSolution/FormEngine/` |
| Online forms | `./resources/repositories/xperience/CMSSolution/OnlineForms/` |
| Email engine | `./resources/repositories/xperience/CMSSolution/EmailEngine/` |
| MVC builder components | `./resources/repositories/xperience/CMSSolution/Mvc/Kentico.Content.Web.Mvc/` |
| Builder RCL components | `./resources/repositories/xperience/CMSSolution/Mvc/Kentico.VisualBuilderComponents.Rcl/` |
| Admin websites (page builder) | `./resources/repositories/xperience/CMSSolution/Admin/Kentico.Xperience.Admin.Websites/` |

## Cross-references

- Page Builder from editor perspective: [business-website-content.md](business-website-content.md) § Widgets and page builder
- Forms from editor perspective: [business-digital-marketing.md](business-digital-marketing.md) § Forms
- Email from editor perspective: [business-digital-marketing.md](business-digital-marketing.md) § Emails
- Admin UI form components (property editors): [dev-admin-ui.md](dev-admin-ui.md) § UI form components
