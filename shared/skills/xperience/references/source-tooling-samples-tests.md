# Tooling, Samples, and Tests

This reference covers the developer-support surfaces in the solution: internal tools, templates, analyzers, samples, and the large test suite.

## Major Paths

| Path | What it contains |
|---|---|
| `./resources/repositories/xperience/CMSSolution/Development/` | Internal development tools |
| `./resources/repositories/xperience/CMSSolution/Tools/` | .NET tools and project templates |
| `./resources/repositories/xperience/CMSSolution/Analyzers/` | Roslyn analyzers, code fixes, analyzer tests |
| `./resources/repositories/xperience/CMSSolution/Samples/` | Sample applications and API examples |
| `./resources/repositories/xperience/CMSSolution/Tests/` | Broad subsystem-by-subsystem automated test projects |
| `./resources/repositories/xperience/CMSSolution/Utils/` | Supporting developer utilities like CI consistency checking, data export, and internal tooling helpers |

## Key Concepts

- These roots explain how the product is built, validated, and demonstrated rather than how end-user features are implemented.
- `Tests/` mirrors many product subsystems, which makes it a valuable navigation aid when you need examples or behavioral coverage.
- `Analyzers/` indicates the product ships internal code-quality rules and fixes.
- `Tools/` and `Development/` separate internal dev support from shipping runtime code.
- `Samples/` is the best place to find usage patterns and integration examples without digging immediately into production internals.

## Important Entry Points

| Kind | Path | Why it matters |
|---|---|---|
| Internal dev tools | `./resources/repositories/xperience/CMSSolution/Development/Kentico.Xperience.InternalDevTools/` | Internal tooling surface |
| Public tooling/templates | `./resources/repositories/xperience/CMSSolution/Tools/Kentico.Xperience.DotnetTools/` | CLI/tooling entry surface |
| Project templates | `./resources/repositories/xperience/CMSSolution/Tools/Kentico.Xperience.Templates/` | Developer starter/template surface |
| Analyzer package | `./resources/repositories/xperience/CMSSolution/Analyzers/Kentico.Xperience.Analyzers/` | Static-analysis entry point |
| Sample APIs | `./resources/repositories/xperience/CMSSolution/Samples/APIExamples/` | Concrete usage examples |
| Subsystem tests | `./resources/repositories/xperience/CMSSolution/Tests/ContentEngine.Tests/` | Example of how tests mirror product domains |

## Cross-References

- Solution foundations: `source-solution-foundations.md`
- Admin and web runtime: `source-admin-and-runtime.md`
- Content and channels: `source-content-and-channels.md`
