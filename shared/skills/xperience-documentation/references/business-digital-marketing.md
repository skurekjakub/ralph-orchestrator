# Digital Marketing (Business Users)

The digital marketing section covers all marketing-facing features in the Xperience admin UI — contact management, email campaigns, forms, automation, customer journeys, and content personalization.

## Documentation pages

| Page | Path | What it covers |
|---|---|---|
| **Digital marketing** (index) | `./src/_documentation/_documentation/business-users/digital-marketing.md` | Overview of digital marketing capabilities |
| Contact management | `./src/_documentation/_documentation/business-users/digital-marketing/contact-management.md` | Viewing and managing contacts; contact detail pages; merging contacts |
| Contact activities | `./src/_documentation/_documentation/business-users/digital-marketing/contact-activities.md` | Activity tracking on contacts; viewing activity history |
| Contact groups | `./src/_documentation/_documentation/business-users/digital-marketing/contact-groups.md` | Creating and managing contact groups (segments); condition-based membership |
| Customer journeys | `./src/_documentation/_documentation/business-users/digital-marketing/customer-journeys.md` | Customer journey overview and reporting |
| Automation | `./src/_documentation/_documentation/business-users/digital-marketing/automation.md` | Automation processes (marketing automation workflows targeting contacts) |
| **Emails** (index) | `./src/_documentation/_documentation/business-users/digital-marketing/emails.md` | Overview of email features |
| Create emails in email builder | `./src/_documentation/_documentation/business-users/digital-marketing/emails/create-emails-in-email-builder.md` | Entry page for email builder |
| → (subfolder) | `./src/_documentation/_documentation/business-users/digital-marketing/emails/create-emails-in-email-builder/` | Detailed email builder usage guides |
| Send regular emails to subscribers | `./src/_documentation/_documentation/business-users/digital-marketing/emails/send-regular-emails-to-subscribers.md` | Sending campaigns to subscriber lists |
| Track email statistics | `./src/_documentation/_documentation/business-users/digital-marketing/emails/track-email-statistics.md` | Viewing email open/click tracking data |
| **Forms** (index) | `./src/_documentation/_documentation/business-users/digital-marketing/forms.md` | Overview of form features |
| Create and edit forms | `./src/_documentation/_documentation/business-users/digital-marketing/forms/create-and-edit-forms.md` | Building forms in the form builder; adding fields |
| Display forms on pages | `./src/_documentation/_documentation/business-users/digital-marketing/forms/display-forms-on-pages.md` | Placing form widgets on pages via Page Builder |
| Manage form submissions | `./src/_documentation/_documentation/business-users/digital-marketing/forms/manage-form-submissions.md` | Viewing and managing submitted form data |
| Use smart fields in forms | `./src/_documentation/_documentation/business-users/digital-marketing/forms/use-smart-fields-in-forms.md` | Smart field (pre-fill, conditional logic) usage |
| Widget personalization | `./src/_documentation/_documentation/business-users/digital-marketing/widget-personalization.md` | Personalizing widget visibility based on contact groups or conditions |

## Key concepts

- **Contacts** represent tracked visitors. They accumulate **activities** (page visits, form submissions, purchases) and can be grouped into **contact groups** (segments) based on conditions.
- **Email campaigns** are created in the **Email Builder** (visual editor similar to Page Builder) and sent through **email channels**.
- **Forms** are created in the **Form Builder** and displayed on pages via a form widget. Form submissions can trigger automation and are tracked as contact activities.
- **Customer journeys** provide analytics on how contacts progress through defined marketing funnels.
- **Automation** processes are step-based workflows that execute actions on contacts (send email, move to group, wait, branch on condition).
- **Widget personalization** allows content editors to show/hide Page Builder widgets based on contact group membership or other conditions.

## Related source code

| Area | Path |
|---|---|
| Online marketing core | `./resources/repositories/xperience/CMSSolution/OnlineMarketing/` |
| Contact management | `./resources/repositories/xperience/CMSSolution/ContactManagement/` |
| Activities | `./resources/repositories/xperience/CMSSolution/Activities/` |
| Email engine | `./resources/repositories/xperience/CMSSolution/EmailEngine/` |
| Email marketing | `./resources/repositories/xperience/CMSSolution/EmailMarketing/` |
| Form engine | `./resources/repositories/xperience/CMSSolution/FormEngine/` |
| Online forms | `./resources/repositories/xperience/CMSSolution/OnlineForms/` |
| Automation | `./resources/repositories/xperience/CMSSolution/Automation/` |
| Customer journeys | `./resources/repositories/xperience/CMSSolution/CustomerJourneys/` |
| Admin digital marketing UI | `./resources/repositories/xperience/CMSSolution/Admin/Kentico.Xperience.Admin.DigitalMarketing/` |

## Cross-references

- Developer-side marketing setup: [dev-digital-marketing-setup.md](dev-digital-marketing-setup.md)
- Form builder development: [dev-builders.md](dev-builders.md) § Form builder
- Email builder development: [dev-builders.md](dev-builders.md) § Email builder
- Email configuration: [dev-configuration.md](dev-configuration.md) § Email configuration
