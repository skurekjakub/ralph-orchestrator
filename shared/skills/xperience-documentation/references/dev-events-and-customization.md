# Events, Providers & Custom Code (Customization)

This reference covers the extensibility hooks in Xperience — global events, custom system providers, scheduled tasks, custom endpoints, application startup code, email customization, and stable API guidelines.

## Documentation pages

| Page | Path | What it covers |
|---|---|---|
| **Handle global events** (index) | `./src/_documentation/_documentation/developers-and-admins/customization/handle-global-events.md` | Overview of the global event system; subscribing to object/form/system events |
| Handle object events | `./src/_documentation/_documentation/developers-and-admins/customization/handle-global-events/handle-object-events.md` | Subscribing to CRUD events on Info objects (insert, update, delete) |
| Handle form events | `./src/_documentation/_documentation/developers-and-admins/customization/handle-global-events/handle-form-events.md` | Subscribing to form submission events |
| Reference: global system events | `./src/_documentation/_documentation/developers-and-admins/customization/handle-global-events/reference-global-system-events.md` | Full reference of available system-level events |
| Set up custom workflow notifications | `./src/_documentation/_documentation/developers-and-admins/customization/handle-global-events/set-up-custom-workflow-notifications.md` | Sending notifications on workflow step transitions |
| **Customize system providers** (index) | `./src/_documentation/_documentation/developers-and-admins/customization/customize-system-providers.md` | Overview of the provider customization pattern |
| Register custom providers | `./src/_documentation/_documentation/developers-and-admins/customization/customize-system-providers/register-custom-providers.md` | Replacing or extending built-in system providers via DI |
| Decorate system services | `./src/_documentation/_documentation/developers-and-admins/customization/decorate-system-services.md` | Decorator pattern for wrapping built-in services |
| Integrate custom code | `./src/_documentation/_documentation/developers-and-admins/customization/integrate-custom-code.md` | General guide for integrating custom code into an Xperience project |
| Run code on application startup | `./src/_documentation/_documentation/developers-and-admins/customization/run-code-on-application-startup.md` | Using `IModule` and registration modules for startup code |
| Scheduled tasks | `./src/_documentation/_documentation/developers-and-admins/customization/scheduled-tasks.md` | Creating and managing scheduled background tasks |
| Secure custom endpoints | `./src/_documentation/_documentation/developers-and-admins/customization/secure-custom-endpoints.md` | Securing custom API endpoints with Xperience authentication |
| Email customization | `./src/_documentation/_documentation/developers-and-admins/customization/email-customization.md` | Customizing email sending behavior and templates |
| Stable customization guidelines | `./src/_documentation/_documentation/developers-and-admins/customization/stable-customization-guidelines.md` | Which APIs are stable vs. internal; safe customization practices |

## Key concepts

- **Global events** fire on object CRUD, form submissions, and system lifecycle events. Subscribe in a module's `OnInit` method.
- **Object events** (`Insert.Before`, `Insert.After`, `Update.Before`, etc.) are the primary hook for business logic on data changes.
- **System providers** can be replaced via DI registration — swap out built-in implementations for custom logic (e.g., custom URL generation, custom email sending).
- **Service decoration** wraps existing services without replacing them — add logging, validation, or extra processing around built-in behavior.
- **Modules** (`IModule` implementations) are the entry point for startup registration — event handler hookups, service overrides, and initialization code.
- **Stable API guidelines** distinguish between public stable APIs (safe to use) and internal APIs (subject to breaking changes). Documentation tasks should always reference stable APIs.

## Related source code

| Area | Path |
|---|---|
| Modules | `./resources/repositories/xperience/CMSSolution/Modules/` |
| Event log | `./resources/repositories/xperience/CMSSolution/EventLog/` |
| Scheduler | `./resources/repositories/xperience/CMSSolution/Scheduler/` |
| Core (base services) | `./resources/repositories/xperience/CMSSolution/Core/` |
| Email engine events | `./resources/repositories/xperience/CMSSolution/EmailEngine/Events/` |
| ContentEngine events | `./resources/repositories/xperience/CMSSolution/ContentEngine/Events/` |
| Websites events | `./resources/repositories/xperience/CMSSolution/Websites/Events/` |
| Content workflow engine | `./resources/repositories/xperience/CMSSolution/ContentWorkflowEngine/` |

## Cross-references

- Admin UI extension: [dev-admin-ui.md](dev-admin-ui.md)
- Dependency injection: [dev-website-basics.md](dev-website-basics.md) § Dependency injection
- Workflows (configuration): [dev-configuration.md](dev-configuration.md) § Workflows
