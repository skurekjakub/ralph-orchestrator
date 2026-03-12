# Security & Data Protection (Developers and Admins)

Security guidelines and data protection (GDPR) documentation — securing Xperience applications, rate limiting, consent management, personal data handling, and cookie compliance.

## Documentation pages

### Security guidelines

| Page | Path | What it covers |
|---|---|---|
| **Security guidelines** (index) | `./src/_documentation/_documentation/developers-and-admins/security-guidelines.md` | Overview of security best practices for Xperience projects |
| Rate limiting | `./src/_documentation/_documentation/developers-and-admins/security-guidelines/rate-limiting.md` | Configuring rate limiting for API and admin endpoints |
| Vulnerabilities in transitive dependencies | `./src/_documentation/_documentation/developers-and-admins/security-guidelines/vulnerabilities-in-transitive-dependencies.md` | Managing NuGet package vulnerabilities; Kentico's policy on transitive dependency CVEs |

### Data protection

| Page | Path | What it covers |
|---|---|---|
| **Data protection** (index) | `./src/_documentation/_documentation/developers-and-admins/data-protection.md` | Overview of data protection features |
| GDPR compliance | `./src/_documentation/_documentation/developers-and-admins/data-protection/gdpr-compliance.md` | How Xperience supports GDPR requirements |
| Consent management | `./src/_documentation/_documentation/developers-and-admins/data-protection/consent-management.md` | Creating and managing consent definitions in the admin UI |
| Consent development | `./src/_documentation/_documentation/developers-and-admins/data-protection/consent-development.md` | Implementing consent collection on the live site; consent API |
| Cookies | `./src/_documentation/_documentation/developers-and-admins/data-protection/cookies.md` | Cookies used by Xperience; managing cookie consent |
| Personal data collection | `./src/_documentation/_documentation/developers-and-admins/data-protection/personal-data-collection.md` | Reporting what personal data the system has collected for a given individual |
| Personal data erasure | `./src/_documentation/_documentation/developers-and-admins/data-protection/personal-data-erasure.md` | Implementing the right to be forgotten; data erasure workflows |

## Key concepts

- **Security guidelines** cover application hardening — rate limiting, secure custom endpoints, dependency management.
- **Rate limiting** uses ASP.NET Core rate limiting middleware, configured per-endpoint.
- **Transitive dependency vulnerabilities** — Kentico's policy on how they handle CVEs in packages they depend on (not their code directly).
- **Consent management** is the admin-side definition of consent types (marketing, analytics, essential). Each consent has text variants and version tracking.
- **Consent development** is the live-site implementation: displaying consent banners, recording user consent via API, checking consent status before using personal data or cookies.
- **Personal data collection** provides APIs to gather all data stored about an individual (needed for GDPR data subject access requests).
- **Personal data erasure** provides APIs to anonymize or delete an individual's data (GDPR right to be forgotten). Developers implement erasure logic for custom data.
- **Cookies** documentation lists all cookies Xperience sets and their purpose — important for cookie consent compliance.

## Related source code

| Area | Path |
|---|---|
| Data protection core | `./resources/repositories/xperience/CMSSolution/DataProtection/` |
| Consent info | `./resources/repositories/xperience/CMSSolution/DataProtection/Consent.cs` |
| Consent agreement | `./resources/repositories/xperience/CMSSolution/DataProtection/ConsentAgreementInfo.cs` |
| Data subject rights | `./resources/repositories/xperience/CMSSolution/DataProtection/DataSubjectRights/` |
| Data protection services | `./resources/repositories/xperience/CMSSolution/DataProtection/Services/` |
| Data protection archive | `./resources/repositories/xperience/CMSSolution/DataProtection/Archive/` |

## Cross-references

- Secure custom endpoints: [dev-events-and-customization.md](dev-events-and-customization.md) § Secure custom endpoints
- Admin user security: [dev-configuration.md](dev-configuration.md) § Users
- Page permissions: [xperience skill — page-permissions](../../xperience/references/page-permissions.md)
- CDP consent: [dev-digital-marketing-setup.md](dev-digital-marketing-setup.md) § Customer Data Platform
