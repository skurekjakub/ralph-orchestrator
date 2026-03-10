# Solution Foundations

This reference covers the solution-level structure and the foundational platform libraries that most other Xperience subsystems build on.

## Major Paths

| Path | What it contains |
|---|---|
| `./resources/repositories/xperience/CMSSolution/CMSSolution.sln` | The main Visual Studio solution containing the product projects |
| `./resources/repositories/xperience/CMSSolution/Directory.Build.props` | Solution-wide build defaults |
| `./resources/repositories/xperience/CMSSolution/Directory.Packages.props` | Central NuGet package version management |
| `./resources/repositories/xperience/CMSSolution/GlobalAssemblyInfo.cs` | Shared assembly metadata |
| `./resources/repositories/xperience/CMSSolution/Base/` | Low-level platform abstractions: application lifecycle, configuration, events, routing helpers, context, tasks |
| `./resources/repositories/xperience/CMSSolution/Core/` | Core service abstractions, factories, IoC container wiring, discovery, shared interfaces |
| `./resources/repositories/xperience/CMSSolution/Helpers/` | Cross-cutting helper libraries for admin, caching, context, media, markup, security, synchronization, text |
| `./resources/repositories/xperience/CMSSolution/Modules/` | Module registration infrastructure and module metadata |
| `./resources/repositories/xperience/CMSSolution/Resources/` | Shared solution assets such as icons and license content |
| `./resources/repositories/xperience/CMSSolution/CMS/` | Legacy CMS host assets like `App_Data` and `web.config` |
| `./resources/repositories/xperience/CMSSolution/Output/` | Debug or generated output assets, not a primary product subsystem |

## Key Concepts

- The solution is organized as a set of domain libraries, with `Base`, `Core`, `Helpers`, and `Modules` acting as shared substrate rather than end-user features.
- `Base/` tends to hold framework-style primitives and host/runtime concerns.
- `Core/` tends to hold service contracts, factories, and container/discovery infrastructure used across product areas.
- `Helpers/` is cross-cutting utility code. It is broad and useful, but it is not a business-domain boundary.
- `Modules/` is the registration seam that many feature libraries use to plug themselves into application startup.
- Top-level build files are important orientation anchors because they explain package/version management and solution-wide defaults.

## Important Entry Points

| Kind | Path | Why it matters |
|---|---|---|
| Solution entry | `./resources/repositories/xperience/CMSSolution/CMSSolution.sln` | Fastest way to see project composition across the product |
| Build config | `./resources/repositories/xperience/CMSSolution/Directory.Build.props` | Shows shared compiler/build configuration |
| Package management | `./resources/repositories/xperience/CMSSolution/Directory.Packages.props` | Shows centrally managed dependency versions |
| Shared runtime base | `./resources/repositories/xperience/CMSSolution/Base/` | Common runtime primitives used by many product libraries |
| Core services | `./resources/repositories/xperience/CMSSolution/Core/` | Common service abstractions and container/discovery infrastructure |
| Module system | `./resources/repositories/xperience/CMSSolution/Modules/` | Plugin/registration seam used across the solution |

## Cross-References

- Platform data and operations: `source-data-security-operations.md`
- Admin and web runtime: `source-admin-and-runtime.md`
- Tooling, samples, and tests: `source-tooling-samples-tests.md`
