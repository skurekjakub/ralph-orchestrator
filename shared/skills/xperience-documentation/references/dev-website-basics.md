# Website Development Basics

Getting started with Xperience website development — new project setup, dependency injection, and local hosting.

## Documentation pages

| Page | Path | What it covers |
|---|---|---|
| **Website development basics** (index) | `./src/_documentation/_documentation/developers-and-admins/development/website-development-basics.md` | Overview of the website development model |
| Configure new projects | `./src/_documentation/_documentation/developers-and-admins/development/website-development-basics/configure-new-projects.md` | Initial project configuration after installation; Startup.cs setup; service registration |
| → (subfolder) | `./src/_documentation/_documentation/developers-and-admins/development/website-development-basics/configure-new-projects/` | Detailed project configuration topics |
| Dependency injection | `./src/_documentation/_documentation/developers-and-admins/development/website-development-basics/dependency-injection.md` | Using ASP.NET Core DI with Xperience services; registering custom services |
| Set up local hosting | `./src/_documentation/_documentation/developers-and-admins/development/website-development-basics/set-up-local-hosting.md` | Running Xperience locally for development; IIS Express and Kestrel configuration |

Also related standalone pages at the development level:

| Page | Path | What it covers |
|---|---|---|
| Logging | `./src/_documentation/_documentation/developers-and-admins/development/logging.md` | Integrating logging; event log; structured logging |
| Reference: Tag helpers | `./src/_documentation/_documentation/developers-and-admins/development/reference-tag-helpers.md` | Built-in Razor tag helpers for Xperience (e.g., page builder, widget rendering) |

## Key concepts

- Xperience is an **ASP.NET Core application**. The developer's project is a standard ASP.NET Core web app that references Xperience NuGet packages.
- **Startup configuration** registers Xperience services (`builder.Services.AddKentico()`), middleware (`app.UseKentico()`), and the route handler (`endpoints.MapKentico()`).
- All Xperience services are available via **dependency injection** — content retrieval, caching, email, etc.
- **Local development** can use Kestrel or IIS Express. The administration interface is accessible at `/admin`.

## Related source code

| Area | Path |
|---|---|
| Web MVC core | `./resources/repositories/xperience/CMSSolution/Mvc/Kentico.Web.Mvc/` |
| Content Web MVC | `./resources/repositories/xperience/CMSSolution/Mvc/Kentico.Content.Web.Mvc/` |
| ASP.NET Core platform | `./resources/repositories/xperience/CMSSolution/Mvc/AspNetCore.Platform/` |
| Sample projects | `./resources/repositories/xperience/CMSSolution/Samples/` |
| Development tools | `./resources/repositories/xperience/CMSSolution/Development/` |

## Cross-references

- Installation: [dev-installation-and-upgrade.md](dev-installation-and-upgrade.md)
- Routing setup: [dev-routing.md](dev-routing.md)
- Content retrieval (first queries): [dev-content-retrieval.md](dev-content-retrieval.md)
