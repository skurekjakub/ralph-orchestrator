# Integrations and Storage

This reference covers external integration packages and the storage/file abstraction layers that connect Xperience to outside services and storage backends.

## Major Paths

| Path | What it contains |
|---|---|
| `./resources/repositories/xperience/CMSSolution/Integrations/` | External integration packages for Azure storage, Amazon storage, cloud support, image processing, Management API, Management API MCP, MJML, SendGrid |
| `./resources/repositories/xperience/CMSSolution/IO/` | File and stream abstractions, providers, storage helpers, file system storage provider, zip storage provider |

## Key Concepts

- `Integrations/` contains optional or boundary-facing packages rather than one single business subsystem.
- Storage integrations such as Azure and Amazon are separate packages, which makes this folder important for deployment/storage customization.
- `Kentico.Xperience.ManagementApi/` and `Kentico.Xperience.ManagementApiMcp/` make this root relevant for external automation and AI-assisted workflows.
- `IO/` is the internal abstraction layer that lets higher-level subsystems work with storage/providers without hard-coding one backend.
- When a feature interacts with external services or storage, start here and then follow the cross-reference into the consuming product subsystem.

## Important Entry Points

| Kind | Path | Why it matters |
|---|---|---|
| Integration packages | `./resources/repositories/xperience/CMSSolution/Integrations/` | Shows the set of official external integration surfaces |
| Azure storage | `./resources/repositories/xperience/CMSSolution/Integrations/Kentico.Xperience.AzureStorage/` | Cloud-storage extension anchor |
| Amazon storage | `./resources/repositories/xperience/CMSSolution/Integrations/Kentico.Xperience.AmazonStorage/` | Alternate storage extension anchor |
| Management API | `./resources/repositories/xperience/CMSSolution/Integrations/Kentico.Xperience.ManagementApi/` | External management/integration surface |
| Management API MCP | `./resources/repositories/xperience/CMSSolution/Integrations/Kentico.Xperience.ManagementApiMcp/` | AI/MCP integration surface |
| File abstraction | `./resources/repositories/xperience/CMSSolution/IO/Providers/` | Provider model for storage abstraction |
| File storage | `./resources/repositories/xperience/CMSSolution/IO/FileSystemStorageProvider/` | File-system-backed storage implementation |

## Cross-References

- Data, security, and operations: `source-data-security-operations.md`
- Content and channels: `source-content-and-channels.md`
- Tooling, samples, and tests: `source-tooling-samples-tests.md`
