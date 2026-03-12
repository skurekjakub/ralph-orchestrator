# Authentication & Membership (Development)

This section covers front-end (live site) member registration, authentication, external identity providers, member roles, and extending member data with custom fields.

## Documentation pages

| Page | Path | What it covers |
|---|---|---|
| **Registration and authentication** (index) | `./src/_documentation/_documentation/developers-and-admins/development/registration-and-authentication.md` | Overview of the membership model; members vs. admin users |
| Forms authentication | `./src/_documentation/_documentation/developers-and-admins/development/registration-and-authentication/forms-authentication.md` | Implementing traditional username/password registration and login forms |
| External authentication | `./src/_documentation/_documentation/developers-and-admins/development/registration-and-authentication/external-authentication.md` | Integrating external identity providers (OAuth, OIDC) for member login |
| Member roles | `./src/_documentation/_documentation/developers-and-admins/development/registration-and-authentication/member-roles.md` | Assigning roles to members; role-based content personalization; role-based page access |
| Add fields to member objects | `./src/_documentation/_documentation/developers-and-admins/development/registration-and-authentication/add-fields-to-member-objects.md` | Extending the member data model with custom fields via the field editor |

## Key concepts

- **Members** are front-end (live site) users. They are distinct from **admin users** (who access the Xperience administration).
- Members use ASP.NET Core Identity under the hood — `Kentico.Membership` bridges Xperience's member data with ASP.NET Identity.
- **Forms authentication** is the traditional email/password flow. **External authentication** supports OAuth 2.0 / OpenID Connect providers.
- **Member roles** control what content members can see (via page ACLs and personalization conditions).
- Member objects can be extended with **custom fields** through the admin UI field editor — these map to database columns.

## Related source code

| Area | Path |
|---|---|
| Membership core | `./resources/repositories/xperience/CMSSolution/Membership/` |
| Kentico.Membership (MVC) | `./resources/repositories/xperience/CMSSolution/Mvc/Kentico.Membership/` |
| Content item member role | `./resources/repositories/xperience/CMSSolution/ContentEngine/ContentItemMemberRole/` |

## Cross-references

- Members (business user management): [business-general.md](business-general.md) § Members
- Admin user management: [dev-configuration.md](dev-configuration.md) § Users
- Page permissions and member access: [xperience skill — page-permissions](../../xperience/references/page-permissions.md)
- Digital marketing contact mapping: [dev-digital-marketing-setup.md](dev-digital-marketing-setup.md) § Contact configuration
