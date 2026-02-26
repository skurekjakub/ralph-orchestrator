---
name: ralph-code-samples
description: "Workflow for writing and integrating .NET code samples into Xperience by Kentico documentation pages using code_link Liquid tags. Use this skill whenever the task involves creating, modifying, or referencing C# code samples, adding code_link tags to documentation pages, working with the CodeSamples project, or when the JIRA issue mentions code examples, API usage demonstrations, or .NET snippets."
---

# Code Samples Skill

Instructions for writing and integrating .NET code samples into Xperience by Kentico documentation pages.

## Code Samples Project

This task requires working with the **ASP.NET code samples project** at `src/_code/src/`. This is a compilable .NET solution whose code is pulled directly into documentation pages via {% raw %}`{% code_link %}`{% endraw %} Liquid tags. The code must build successfully for the docs site to render.

### Project layout

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

Feature areas contain the actual `.cs` files organized by domain. Some have a `StandaloneSamples/` subdirectory for self-contained examples that don't integrate with the Website project.

### How code_link works

Documentation pages reference compiled code via the {% raw %}`{% code_link %}`{% endraw %} tag:

```liquid
{% raw %}
{% code_link source="CodeSamples/FeatureArea/ClassName.cs" lang="csharp" title="Description" id="unique-id" %}
{% endraw %}
```

- The `source` path is **relative to `src/_code/src/`**
- The tag pulls code directly from the compiled project — **if the code doesn't build, the docs don't render**
- Each `code_link` needs a unique `id` within the page

### Workflow rules for code samples

1. **Read existing samples** in the target feature area before writing new ones — match namespace patterns (`Codesamples.*`), code style, and directory organization
2. **Build after every change**: `npm run codesamples:build` (runs `dotnet build` in `src/_code/src/`)
3. **Build failures block the PR** — never commit code that doesn't compile
4. **Add `code_link` tags** in the documentation page that references the new code — the `source` path must exactly match the file path relative to `src/_code/src/`
5. **Use explicit types** instead of `var` — readers need to see the types
6. **Never edit `Generated/`** — these files are produced by `npm run codesamples:codegen`
