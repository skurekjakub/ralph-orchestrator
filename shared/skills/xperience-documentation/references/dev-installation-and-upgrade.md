# Installation & Upgrade (Developers and Admins)

Getting Xperience running — system requirements, installation, project updates, licensing, and upgrading from older Kentico versions.

## Documentation pages

| Page | Path | What it covers |
|---|---|---|
| **Installation** (index) | `./src/_documentation/_documentation/developers-and-admins/installation.md` | Overview of installation methods |
| System requirements | `./src/_documentation/_documentation/developers-and-admins/installation/system-requirements.md` | Required .NET version, database, OS, browser compatibility |
| Licenses | `./src/_documentation/_documentation/developers-and-admins/installation/licenses.md` | License types; activation; license key management |
| Update Xperience by Kentico projects | `./src/_documentation/_documentation/developers-and-admins/installation/update-xperience-by-kentico-projects.md` | Updating to newer Xperience versions (NuGet package updates, database update) |
| Installation troubleshooting | `./src/_documentation/_documentation/developers-and-admins/installation/installation-troubleshooting.md` | Common installation problems and solutions |
| Installation questions and answers | `./src/_documentation/_documentation/developers-and-admins/installation/installation-questions-and-answers.md` | FAQ for installation |
| MCP server | `./src/_documentation/_documentation/developers-and-admins/installation/mcp-server.md` | Installing and using the Xperience MCP server for AI-assisted development |
| Support policy | `./src/_documentation/_documentation/developers-and-admins/installation/support-policy.md` | Version support lifecycle; LTS vs. current releases |
| Uninstall Xperience components | `./src/_documentation/_documentation/developers-and-admins/installation/uninstall-xperience-by-kentico-components.md` | Removing Xperience packages from a project |

### Upgrade

| Page | Path | What it covers |
|---|---|---|
| Upgrade to Xperience by Kentico | `./src/_documentation/_documentation/developers-and-admins/upgrade-to-xperience-by-kentico.md` | Migrating from older Kentico versions (KX13, KX12) to Xperience by Kentico |
| Migration toolkit | `./src/_documentation/_documentation/developers-and-admins/upgrade-to-xperience-by-kentico/migration-toolkit.md` | The migration tool for data transfer from older versions |
| Editing components in Xperience by Kentico | `./src/_documentation/_documentation/developers-and-admins/upgrade-to-xperience-by-kentico/editing-components-in-xperience-by-kentico.md` | Component changes to be aware of when upgrading |

### Third-party

| Page | Path | What it covers |
|---|---|---|
| Third-party integrations | `./src/_documentation/_documentation/developers-and-admins/third-party-integrations.md` | Overview of third-party integrations and their documentation |
| Integrate with decoupled systems | `./src/_documentation/_documentation/developers-and-admins/integrate-with-decoupled-systems.md` | Integrating Xperience with external front-ends or services |

## Key concepts

- Xperience by Kentico is an **ASP.NET Core application** installed via NuGet packages and a project template.
- **Updates** are applied by updating NuGet packages and running database update commands. Each release has update instructions.
- **Upgrade from older versions** (KX13/KX12) uses the **Migration Toolkit** — a separate tool that transfers content, objects, and settings to the new platform.
- The **MCP server** enables AI tools (Copilot, Claude) to interact with Xperience project context for development assistance.
- **Support policy** defines which versions receive patches, security updates, and feature updates.

## Related source code

| Area | Path |
|---|---|
| License provider | `./resources/repositories/xperience/CMSSolution/LicenseProvider/` |
| Migration utility | `./resources/repositories/xperience/CMSSolution/MigrationUtility/` |
| Tools | `./resources/repositories/xperience/CMSSolution/Tools/` |

## Cross-references

- Website development basics (first steps after install): [dev-website-basics.md](dev-website-basics.md)
- Deployment: [dev-deployment-and-saas.md](dev-deployment-and-saas.md)
- System requirements → configuration keys: [dev-configuration.md](dev-configuration.md) § Reference: configuration keys
