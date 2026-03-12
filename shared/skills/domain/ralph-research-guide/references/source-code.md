# Source Code Research

Techniques for exploring the Xperience by Kentico C# product source code during research.

## Source Code Location

The Xperience product source code is mounted at `resources/repositories/xperience/`. This path is **gitignored** — always use `includeIgnoredFiles: true` when searching it.

## Search Strategy

### Start with the API Surface

1. **Class names** — search for the class or interface name from the JIRA issue (e.g., `class PageBuilderOptions`) or from the related documentation.
2. **Namespace** — from the namespace, find related classes and concepts.

### Dig Into Implementation

4. **Inheritance chain** — search for `: BaseClassName` to find derived types, or read the class declaration to find its base
5. **Method signatures** — extract the exact return type, parameter types, and parameter names (the writer needs these verbatim)
6. **Enum values** — when a parameter or property is an enum, find and extract all values with their numeric assignments
7. **Default values** — check constructors, property initializers, and configuration registration for defaults
8. **Configuration options** — search for `Register` attributes, `IOptions<T>` patterns, or `appsettings.json` bindings

### Verify Claims

- When existing docs say "method X accepts parameters A, B, C" — find the actual method and confirm
- When docs describe behavior — find the implementation and verify
- Flag every discrepancy: wrong parameter names, missing overloads, outdated defaults, renamed classes

### Cross-Reference .NET Framework APIs

When your source code exploration surfaces .NET framework or ASP.NET Core types (e.g., `ClaimsPrincipal`, `ClaimTypes`, `[Authorize]`, `IAuthorizationHandler`, `IOptions<T>`), **always cross-reference with `microsoft_docs_search`** before finishing the source code findings section:

1. Search for the specific API name (e.g., `microsoft_docs_search("ClaimTypes.Role")`)
2. Fetch the top result with `web_fetch` to confirm correct usage, expected behavior, and configuration prerequisites
3. Note any framework-level requirements the Xperience implementation depends on (e.g., middleware ordering, claims configuration, service registration)

This is especially important for security, authentication, and authorization APIs where incorrect documentation could lead users to misconfigure their applications.

## Common Patterns in Xperience Source

- **Modules** — `[assembly: RegisterModule(typeof(XModule))]` — module registration
- **Services** — interface + implementation registered via DI in the module's `Init()` method
- **Page types** — classes with `[RegisterContentTypeMapping]` attributes
- **Event handlers** — `XEvents.Y.Execute += handler` pattern + asinc `IEventHandler` pattern
- **Info objects** — `XInfo` / `XInfoProvider` pattern for database-backed entities

## What to Report

For each relevant source code finding:
- Full class/interface name with namespace
- File path within `resources/repositories/xperience/`
- Key method signatures (return type, name, parameters)
- Enum values if applicable
- Default values and configuration knobs
- Discrepancies with existing documentation
