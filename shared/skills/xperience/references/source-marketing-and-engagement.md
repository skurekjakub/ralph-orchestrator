# Marketing and Engagement

This reference covers the product areas that track contacts and activities, automate journeys, deliver emails, build forms, and power marketing-facing experiences.

## Major Paths

| Path | What it contains |
|---|---|
| `./resources/repositories/xperience/CMSSolution/Activities/` | Activity types, logging, queueing, validators, URL/title builders |
| `./resources/repositories/xperience/CMSSolution/Automation/` | Automation engine, actions, triggers, evaluators, process statistics |
| `./resources/repositories/xperience/CMSSolution/ContactManagement/` | Contact model, groups, CDP, automation hooks, mapping, merging, inactive-contact cleanup |
| `./resources/repositories/xperience/CMSSolution/CustomerJourneys/` | Customer journey processors and evaluators |
| `./resources/repositories/xperience/CMSSolution/OnlineMarketing/` | Online marketing web-facing integration, cross-site tracking, activity-related hooks |
| `./resources/repositories/xperience/CMSSolution/EmailEngine/` | Email sending core: content, senders, attachments, configuration, services |
| `./resources/repositories/xperience/CMSSolution/EmailMarketing/` | Email marketing-specific logic: recipients, bounces, email library, macro support |
| `./resources/repositories/xperience/CMSSolution/FormEngine/` | Form definitions, controls, validation, providers |
| `./resources/repositories/xperience/CMSSolution/OnlineForms/` | Form submissions, smart fields, notifications, roles, file service, automation/activity integration |

## Key Concepts

- `Activities/` is the low-level event/activity logging substrate used across marketing features.
- `ContactManagement/` is the central customer/contact domain and owns contact groups, CDP-related pieces, mapping, merging, and activity-related helpers.
- `Automation/` and `CustomerJourneys/` are separate but adjacent orchestration/analytics layers for contact behavior.
- Email functionality is split between transport/core sending (`EmailEngine/`) and marketing-specific email workflows (`EmailMarketing/`).
- Forms are split between form-definition infrastructure (`FormEngine/`) and online-form product behavior (`OnlineForms/`).
- `OnlineMarketing/` looks like the live-site integration layer that connects web activity and tracking into the broader marketing stack.

## Important Entry Points

| Kind | Path | Why it matters |
|---|---|---|
| Activity core | `./resources/repositories/xperience/CMSSolution/Activities/ActivityLogService.cs` | Representative anchor for activity logging |
| Automation engine | `./resources/repositories/xperience/CMSSolution/Automation/AutomationEngine/` | Core automation processing surface |
| Contacts | `./resources/repositories/xperience/CMSSolution/ContactManagement/Contact/` | Core contact domain |
| Contact groups | `./resources/repositories/xperience/CMSSolution/ContactManagement/ContactGroup/` | Segmentation/group surface |
| CDP | `./resources/repositories/xperience/CMSSolution/ContactManagement/CustomerDataPlatform/` | CDP-related contact integration |
| Customer journeys | `./resources/repositories/xperience/CMSSolution/CustomerJourneys/CustomerJourneysProcessor/` | Journey processing surface |
| Email sending | `./resources/repositories/xperience/CMSSolution/EmailEngine/Senders/` | Email delivery implementation surface |
| Marketing email | `./resources/repositories/xperience/CMSSolution/EmailMarketing/EmailMarketing/` | Marketing-email-specific logic |
| Form controls | `./resources/repositories/xperience/CMSSolution/FormEngine/FormControls/` | Custom form control surface |
| Online form behavior | `./resources/repositories/xperience/CMSSolution/OnlineForms/SmartFields/` | One anchor for online-form product features |

## Cross-References

- Commerce: `source-commerce.md`
- Data, security, and operations: `source-data-security-operations.md`
- Admin and web runtime: `source-admin-and-runtime.md`
