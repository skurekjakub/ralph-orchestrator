# Deployment & SaaS (Developers and Admins)

Deployment documentation covers deploying Xperience to SaaS (Kentico-hosted) and private cloud environments, plus the Xperience Portal management interface and SaaS-specific features.

## Documentation pages

### Deployment

| Page | Path | What it covers |
|---|---|---|
| **Deployment** (index) | `./src/_documentation/_documentation/developers-and-admins/deployment.md` | Overview of deployment options (SaaS vs. private cloud) |
| Deploy to the SaaS environment | `./src/_documentation/_documentation/developers-and-admins/deployment/deploy-to-the-saas-environment.md` | SaaS deployment process |
| → Manage SaaS deployments | `./src/_documentation/_documentation/developers-and-admins/deployment/deploy-to-the-saas-environment/manage-saas-deployments.md` | Managing deployed SaaS instances; rollback; environment management |
| Deploy to private cloud | `./src/_documentation/_documentation/developers-and-admins/deployment/deploy-to-private-cloud.md` | Self-hosted deployment (Azure, AWS, on-premises) |
| → Deploy without the administration | `./src/_documentation/_documentation/developers-and-admins/deployment/deploy-to-private-cloud/deploy-without-the-administration.md` | Headless deployment without the admin UI |
| → Run behind a proxy server | `./src/_documentation/_documentation/developers-and-admins/deployment/deploy-to-private-cloud/run-xperience-by-kentico-behind-a-proxy-server.md` | Reverse proxy configuration (Nginx, IIS ARR) |
| Read-only deployments | `./src/_documentation/_documentation/developers-and-admins/deployment/read-only-deployments.md` | Read-only (no admin) deployment targets |

### SaaS

| Page | Path | What it covers |
|---|---|---|
| **SaaS** (index) | `./src/_documentation/_documentation/developers-and-admins/saas.md` | Overview of SaaS features and constraints |
| SaaS overview | `./src/_documentation/_documentation/developers-and-admins/saas/saas-overview.md` | What's included in SaaS; architecture overview |
| SaaS service plans | `./src/_documentation/_documentation/developers-and-admins/saas/saas-service-plans.md` | Plan tiers; resource limits; feature availability |
| Differences: SaaS vs. private cloud | `./src/_documentation/_documentation/developers-and-admins/saas/differences-saas-private-cloud.md` | Feature and capability comparison |
| SaaS FAQ | `./src/_documentation/_documentation/developers-and-admins/saas/saas-frequently-asked-questions.md` | Common SaaS questions and answers |
| Xperience Portal | `./src/_documentation/_documentation/developers-and-admins/saas/xperience-portal.md` | Portal for managing SaaS subscriptions and instances |
| → Reference: Portal user roles | `./src/_documentation/_documentation/developers-and-admins/saas/xperience-portal/reference-xperience-portal-user-roles.md` | Portal user role reference |

## Key concepts

- **SaaS deployment** is Kentico-hosted — Kentico manages infrastructure, updates, and scaling. Deployment is done via the Xperience Portal.
- **Private cloud** deployment is self-hosted — the developer manages the infrastructure (Azure App Service, Docker, IIS, etc.).
- **Read-only deployments** serve the live site without the admin interface — useful for CDN edge nodes or scaled-out front-ends.
- The **Xperience Portal** is the management interface for SaaS customers — deploy, manage environments, view logs, configure domains.
- **SaaS differences** from private cloud mainly involve: file system (managed storage), custom code restrictions, and update cadence.

## Related source code

| Area | Path |
|---|---|
| Auto-scaling / web farm sync | `./resources/repositories/xperience/CMSSolution/WebFarmSync/` |

## Cross-references

- SaaS configuration: [dev-configuration.md](dev-configuration.md) § SaaS configuration
- Auto-scaling support: [dev-configuration.md](dev-configuration.md) § Auto-scaling support
- CI/CD (deployment pipeline): [dev-ci-cd.md](dev-ci-cd.md)
- Installation: [dev-installation-and-upgrade.md](dev-installation-and-upgrade.md)
