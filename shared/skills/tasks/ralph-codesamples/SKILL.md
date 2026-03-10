---
name: ralph-codesamples
description: "Complete reference for the Xperience by Kentico codesamples .NET project — solution structure, feature-folder organization, code_link integration, build workflow, and coding conventions. Use this skill whenever working with files in src/_code/src/, creating or modifying C# code samples, adding code_link tags to documentation pages, or when the JIRA issue mentions code examples, API usage, or .NET snippets."
---

# Code Samples Skill

Complete reference for the codesamples .NET project — structure, integration, and workflow.

## Solution Structure

The codesamples project at `src/_code/src/` is a working Xperience by Kentico implementation used to source compilable, verified code snippets for documentation. The documentation build pipeline extracts regions marked with `//Include:` / `//EndInclude:` comments and embeds them into pages via {% raw %}`{% code_link %}`{% endraw %} Liquid tags. Because the code lives in a real, buildable project, API changes are caught at compile time — **if the code doesn't build, the docs don't render**.

The solution (`Solution.slnx`) contains two projects:

| Project | Type | Role |
|---------|------|------|
| **CodeSamples** | Razor Class Library (`Microsoft.NET.Sdk.Razor`) | All sample code — controllers, services, models, views, generated content types, and standalone snippets. |
| **Website** | ASP.NET Core Web App (`Microsoft.NET.Sdk.Web`) | Thin entry point. References the CodeSamples DLL, wires up DI and Kentico services. Contains almost no domain logic. |

The Website registers CodeSamples via `AddApplicationPart` (controllers) and a custom `AddCodeSamplesViews()` extension (Razor views).

### Directory Layout

```
src/_code/src/
  Solution.slnx                    — Solution file (CodeSamples + Website projects)
  CodeSamples/                     — Main code samples library
    CodeSamples.csproj.sample      — Project file template (copy → .csproj, restore NuGet)
    DigitalCommerce/               — Feature area: digital commerce services, stock, pricing
    Membership/                    — Feature area: auth, registration, user management
    Views/                         — Razor views referenced by code samples
    Generated/                     — Auto-generated content types (do NOT edit — run codegen)
  Website/                         — ASP.NET host project that references CodeSamples
    Website.csproj.sample          — Project file template
```

### Feature-Folder Organization

Each functional domain gets its own top-level folder inside the CodeSamples project. When adding a new feature area, create a new top-level folder following the same pattern. Each feature folder typically contains:

- **Controllers/** — ASP.NET MVC controllers
- **Services/** — Business logic and Xperience API integration
- **Models/** — View models and DTOs
- **Extensions/** — `IServiceCollection` extension methods for DI registration
- **StandaloneSamples/** — Self-contained example files demonstrating isolated API usage (not wired into the running Website). Use `//Include:` / `//EndInclude:` markers to demarcate extractable regions.

### Generated Content Types

The `Generated/` folder contains auto-generated C# classes produced by the Xperience code generator. Run `npm run codesamples:codegen` to regenerate. **Never edit these files manually.**

## code_link Integration

Documentation pages reference compiled code via the {% raw %}`{% code_link %}`{% endraw %} tag:

```liquid
{% raw %}
{% code_link source="CodeSamples/FeatureArea/ClassName.cs" lang=csharp title="Title" id="section-id" exclude="inner" %}
{% endraw %}
```

- `source` (required) — path **relative to `src/_code/src/`**
- `lang` (required) — language
- `id` (optional) — extract only the region between `//Include:section-id` and `//EndInclude:section-id` markers in the source file
- `exclude` (optional) — exclude a nested region within the included section
- `title`, `highlight`, `linenumbers` — same as {% raw %}`{% code %}`{% endraw %}

## CI Repository and Object Codenames

The codesamples project uses Xperience's [Continuous Integration](https://docs.kentico.com/documentation/developers-and-admins/ci-cd/configure-ci-cd-repositories) feature to persist database objects as XML files in `src/_code/src/Website/App_Data/CIRepository/`.

The `repository.config` filters objects by codename prefix — **only objects whose code name starts with `codesamples` are included**. Any object without this prefix is silently excluded from CI and will not be persisted.

### Codename rules

- **Always prefix codenames with `codesamples.`** (e.g., `codesamples.premium`, `codesamples.express-shipping`)
- In the admin UI, many forms auto-generate the codename from the display name. You must **expand the "Identifiers" section** and **uncheck "Pre-fill code name automatically"** to set a custom codename with the `codesamples.` prefix
- After creating objects, run `npm run codesamples:store` to serialize them to CI XML
- Commit the resulting XML files — they are the source of truth for these objects

### Data seeders vs CI

**Do NOT create data seeder classes** (in `Website/Initialization/SeedersImpl/`) for objects that are stored under CI. The CI restore process (`npm run codesamples:setversion`) creates these objects automatically from the XML files — writing a seeder would duplicate the work and risk conflicts.

Seeders are only for objects that **cannot** be stored via CI — for example, individual member accounts, customer records, orders, and other transactional data that the CI system does not serialize.

| Persistence method | Object examples | Where defined |
|---|---|---|
| **CI (XML)** | Content types, taxonomies, tags, member roles, order statuses, shipping methods, payment methods, promotions | `CIRepository/` XML files |
| **Data seeders** | Members, customers, orders, role assignments | `Website/Initialization/SeedersImpl/*.cs` |

## Build and Serve

| Script | Purpose |
|--------|---------|
| `npm run codesamples:build` | Verify the project compiles (run after every change) |
| `npm run codesamples:codegen` | Regenerate content type classes into `Generated/` |
| `npm run codesamples:serve` | Start the Website with hot reload at localhost:666 |

## Workflow Rules

1. **Read existing samples** in the target feature area before writing new ones — match namespace patterns (`Codesamples.*`), code style, and directory organization
2. **Build before committing**: `npm run codesamples:build`
3. **Build failures block the PR** — never commit code that doesn't compile
4. **Add `code_link` tags** in the documentation page — the `source` path must exactly match the file path relative to `src/_code/src/`
5. **Use explicit types** instead of `var` — readers need to see the types
6. **Never edit `Generated/`** — run `npm run codesamples:codegen` instead
