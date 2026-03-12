# CI/CD (Developers and Admins)

Continuous Integration and Continuous Deployment documentation — serializing Xperience objects to XML for version control, restoring them across environments, database migration scripts, and repository configuration.

## Documentation pages

| Page | Path | What it covers |
|---|---|---|
| **CI/CD** (index) | `./src/_documentation/_documentation/developers-and-admins/ci-cd.md` | Overview of the CI/CD model; store vs. restore cycle |
| Continuous integration | `./src/_documentation/_documentation/developers-and-admins/ci-cd/continuous-integration.md` | Serializing object data to the CI/CD repository (store); restoring from repository files |
| Continuous deployment | `./src/_documentation/_documentation/developers-and-admins/ci-cd/continuous-deployment.md` | Automated deployment workflows using CI/CD data |
| CI/CD repository structure | `./src/_documentation/_documentation/developers-and-admins/ci-cd/ci-cd-repository-structure.md` | Directory layout and file format of the CI/CD repository |
| Database migration scripts | `./src/_documentation/_documentation/developers-and-admins/ci-cd/ci-cd-database-migration-scripts.md` | Custom SQL migration scripts for schema changes not covered by CI/CD |
| Configure CI/CD repositories | `./src/_documentation/_documentation/developers-and-admins/ci-cd/configure-ci-cd-repositories.md` | Configuring which objects are included/excluded from CI/CD |
| → Repository configuration templates | `./src/_documentation/_documentation/developers-and-admins/ci-cd/configure-ci-cd-repositories/repository-configuration-templates.md` | Pre-built configuration templates for common setups |
| → Config v2 migration | `./src/_documentation/_documentation/developers-and-admins/ci-cd/configure-ci-cd-repositories/config-v2-migration.md` | Migrating from v1 to v2 repository configuration format |
| Reference: CI/CD object types | `./src/_documentation/_documentation/developers-and-admins/ci-cd/reference-ci-cd-object-types.md` | Full reference of all object types supported by CI/CD serialization |

## Key concepts

- **CI/CD repository** serializes Xperience database objects (content types, page templates, workflows, settings, etc.) to XML files in a file system directory. This is committed to version control.
- **Store** writes current database state to the repository. **Restore** applies repository files to the database. This is the mechanism for environment synchronization.
- Objects that CI/CD serializes include: content types, reusable field schemas, channels, taxonomies, roles, workflows, macros, form definitions, and more. **Content items are NOT serialized** (they are managed separately via content sync or manual migration).
- **Database migration scripts** handle schema changes (adding columns, modifying tables) that CI/CD's object serialization doesn't cover.
- **Repository configuration** controls which objects are included. The v2 format uses include/exclude rules with object type filtering.

## Related source code

| Area | Path |
|---|---|
| Continuous integration core | `./resources/repositories/xperience/CMSSolution/ContinuousIntegration/` |
| CI/CD file system repository | `./resources/repositories/xperience/CMSSolution/ContinuousIntegration/FileSystemRepository/` |
| Website CI/CD handlers | `./resources/repositories/xperience/CMSSolution/Websites/ContinuousIntegration/` |
| Content engine CI/CD handlers | `./resources/repositories/xperience/CMSSolution/ContentEngine/ContinuousIntegration/` |
| Headless CI/CD handlers | `./resources/repositories/xperience/CMSSolution/Headless/ContinuousIntegration/` |

## Cross-references

- Deployment: [dev-deployment-and-saas.md](dev-deployment-and-saas.md)
- Object types (what gets serialized): [dev-object-types-and-fields.md](dev-object-types-and-fields.md)
- Configuration keys: [dev-configuration.md](dev-configuration.md) § Reference: configuration keys
