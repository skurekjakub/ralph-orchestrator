# Digital Marketing Setup (Developers and Admins)

Developer-side configuration and integration for Xperience's digital marketing features — contacts, email channels, tracking, personalization, CDP, activities, subscriptions, and form autoresponders.

## Documentation pages

| Page | Path | What it covers |
|---|---|---|
| **Digital marketing setup** (index) | `./src/_documentation/_documentation/developers-and-admins/digital-marketing-setup.md` | Overview of developer-side marketing configuration |

### Contact configuration

| Page | Path | What it covers |
|---|---|---|
| Contact configuration | `./src/_documentation/_documentation/developers-and-admins/digital-marketing-setup/contact-configuration.md` | Developer-side contact system setup |
| → Contact recognition logic | `./src/_documentation/_documentation/developers-and-admins/digital-marketing-setup/contact-configuration/contact-recognition-logic.md` | How visitors become contacts; identification flow; cookie-based tracking |
| → Map custom member fields to contacts | `./src/_documentation/_documentation/developers-and-admins/digital-marketing-setup/contact-configuration/map-custom-member-fields-to-contacts.md` | Syncing member data to contact records |
| → Delete inactive contacts | `./src/_documentation/_documentation/developers-and-admins/digital-marketing-setup/contact-configuration/delete-inactive-contacts.md` | Contact cleanup configuration |
| → Configure custom contact field empty values | `./src/_documentation/_documentation/developers-and-admins/digital-marketing-setup/contact-configuration/configure-custom-contact-field-empty-values.md` | Default values for custom contact fields |

### Email & subscriptions

| Page | Path | What it covers |
|---|---|---|
| Email channel management | `./src/_documentation/_documentation/developers-and-admins/digital-marketing-setup/email-channel-management.md` | Creating and configuring email channels |
| → Manage multiple email channels | `./src/_documentation/_documentation/developers-and-admins/digital-marketing-setup/email-channel-management/manage-multiple-email-channels.md` | Multi-channel email setup |
| Email templates | `./src/_documentation/_documentation/developers-and-admins/digital-marketing-setup/email-templates.md` | Email template development and registration |
| Enable email subscriptions | `./src/_documentation/_documentation/developers-and-admins/digital-marketing-setup/enable-email-subscriptions.md` | Setting up subscription/unsubscription flows |
| Custom form autoresponder emails | `./src/_documentation/_documentation/developers-and-admins/digital-marketing-setup/custom-form-autoresponder-emails.md` | Autoresponder email setup for form submissions |

### Tracking & personalization

| Page | Path | What it covers |
|---|---|---|
| Set up activities | `./src/_documentation/_documentation/developers-and-admins/digital-marketing-setup/set-up-activities.md` | Registering custom activities |
| → (subfolder) | `./src/_documentation/_documentation/developers-and-admins/digital-marketing-setup/set-up-activities/` | Detailed activity setup topics |
| Set up email tracking | `./src/_documentation/_documentation/developers-and-admins/digital-marketing-setup/set-up-email-tracking.md` | Email open/click tracking configuration |
| → (subfolder) | `./src/_documentation/_documentation/developers-and-admins/digital-marketing-setup/set-up-email-tracking/` | Detailed email tracking topics |
| Headless tracking | `./src/_documentation/_documentation/developers-and-admins/digital-marketing-setup/headless-tracking.md` | Activity tracking for headless channel visitors |
| Cross-site tracking | `./src/_documentation/_documentation/developers-and-admins/digital-marketing-setup/cross-site-tracking.md` | Tracking contacts across multiple website channels |
| Content personalization | `./src/_documentation/_documentation/developers-and-admins/digital-marketing-setup/content-personalization.md` | Setting up personalization conditions |
| → (subfolder) | `./src/_documentation/_documentation/developers-and-admins/digital-marketing-setup/content-personalization/` | Detailed personalization topics |

### Customer Data Platform (CDP)

| Page | Path | What it covers |
|---|---|---|
| Customer data platform | `./src/_documentation/_documentation/developers-and-admins/digital-marketing-setup/customer-data-platform.md` | CDP integration overview |
| → Consent development (CDP) | `./src/_documentation/_documentation/developers-and-admins/digital-marketing-setup/customer-data-platform/consent-development-cdp.md` | CDP-specific consent handling |

## Key concepts

- **Contact recognition** identifies anonymous visitors as contacts using cookies, then upgrades them to known contacts on form submission or login.
- **Activities** are actions performed by contacts (page visit, form submit, purchase, custom actions). Custom activities can be registered by developers.
- **Email channels** are the delivery infrastructure for email campaigns — each channel has its own sender, domain, and configuration.
- **Personalization conditions** determine which content variant contacts see — based on contact groups, activities, or custom logic.
- **Headless tracking** enables activity logging from headless/SPA front-ends via API.
- **CDP integration** connects Xperience's contact data with external customer data platforms.

## Related source code

| Area | Path |
|---|---|
| Contact management | `./resources/repositories/xperience/CMSSolution/ContactManagement/` |
| Activities | `./resources/repositories/xperience/CMSSolution/Activities/` |
| Online marketing | `./resources/repositories/xperience/CMSSolution/OnlineMarketing/` |
| Cross-site tracking | `./resources/repositories/xperience/CMSSolution/OnlineMarketing/CrossSiteTracking/` |
| Email marketing | `./resources/repositories/xperience/CMSSolution/EmailMarketing/` |
| Email engine | `./resources/repositories/xperience/CMSSolution/EmailEngine/` |
| MVC online marketing | `./resources/repositories/xperience/CMSSolution/Mvc/Kentico.OnlineMarketing.Web.Mvc/` |
| Admin digital marketing | `./resources/repositories/xperience/CMSSolution/Admin/Kentico.Xperience.Admin.DigitalMarketing/` |

## Cross-references

- Digital marketing (business user): [business-digital-marketing.md](business-digital-marketing.md)
- Email builder development: [dev-builders.md](dev-builders.md) § Email builder
- Data protection / consent: [dev-security-and-data-protection.md](dev-security-and-data-protection.md)
- Authentication / member mapping: [dev-auth.md](dev-auth.md)
