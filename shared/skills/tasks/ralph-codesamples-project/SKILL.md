---
name: ralph-codesamples-project
description: "Overview of the codesamples .NET solution structure, build workflow, and feature-folder organization patterns. Use this skill when working with files in src/_code/src/, creating new feature folders, understanding the CodeSamples vs Website project split, running build/codegen/serve commands, or adding standalone samples."
---

# Codesamples Project Skill

Overview of the codesamples project structure, build workflow, and organization patterns for the Xperience by Kentico docs.

## Solution Structure

The codesamples project at `src/_code/src` is a working Xperience by Kentico implementation used to source compilable, verified code snippets for the documentation. The documentation build pipeline extracts regions marked with `//Include:` / `//EndInclude:` comments and embeds them into documentation pages. Because the code lives in a real, buildable project, API changes and breaking updates are caught at compile time.

The solution (`Solution.slnx`) contains two projects:

| Project | Type | Role |
|---------|------|------|
| **CodeSamples** | Razor Class Library (`Microsoft.NET.Sdk.Razor`) | All sample code — controllers, services, models, views, generated content types, and standalone snippets. |
| **Website** | ASP.NET Core Web App (`Microsoft.NET.Sdk.Web`) | Thin entry point. References the CodeSamples DLL, wires up DI and Kentico services. Contains almost no domain logic. |

The Website registers CodeSamples via `AddApplicationPart` (controllers) and a custom `AddCodeSamplesViews()` extension (Razor views).

## Feature-Folder Organization

Each functional domain area gets its own top-level folder inside the CodeSamples project:

```
CodeSamples/
├── DigitalCommerce/       ← Commerce features (store, cart, checkout, promotions)
├── Membership/            ← Authentication, registration
├── Generated/             ← Auto-generated content type classes (codegen output)
├── Views/                 ← Razor views shipped with the RCL
```

**When adding a new feature area**, create a new top-level folder following the same pattern. Each feature folder typically contains:

- **Controllers/** — ASP.NET MVC controllers
- **Services/** — Business logic and Xperience API integration
- **Models/** — View models and DTOs
- **Extensions/** — `IServiceCollection` extension methods for DI registration
- **StandaloneSamples/** — Self-contained example files demonstrating isolated API usage (not wired into the running Website)

### Standalone Samples

Nearly every feature subfolder contains a `StandaloneSamples/` directory with files that demonstrate individual API patterns. Use `//Include:` / `//EndInclude:` markers to demarcate extractable regions.

### Generated Content Types

The `Generated/` folder contains auto-generated C# classes produced by the Xperience code generator. Run `src/_code/scripts/codegen.sh` to regenerate.

## Build and Serve

| Script | Purpose |
|--------|---------|
| `npm run codesamples:build` | Verify the project compiles (run after every change) |
| `npm run codesamples:codegen` | Regenerate content type classes into `Generated/` |
| `npm run codesamples:serve` | Start the Website with hot reload at localhost:666 |

After every task/update/iteration on the project files, run `npm run codesamples:build` to verify the project compiles, and check workspace errors and resolve.
