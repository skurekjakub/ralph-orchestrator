# Data, Security, and Operations

This reference covers the foundational data layer and the operational/system services that support the product at runtime.

## Major Paths

| Path | What it contains |
|---|---|
| `./resources/repositories/xperience/CMSSolution/DataEngine/` | Generic object/data layer: query infrastructure, providers, database access helpers, settings, transactions, dependencies |
| `./resources/repositories/xperience/CMSSolution/DbDataManager/` | Installation, update, migration, and database-management infrastructure |
| `./resources/repositories/xperience/CMSSolution/DataProtection/` | Consents, data subject rights, archive, GDPR-oriented services |
| `./resources/repositories/xperience/CMSSolution/Globalization/` | Countries, localization, time zones, resource handling |
| `./resources/repositories/xperience/CMSSolution/MacroEngine/` | Macro evaluation, expression resolution, security, namespaces, wrappers |
| `./resources/repositories/xperience/CMSSolution/Notifications/` | Notification queueing, template/message resolution, processors, and email-notification helpers |
| `./resources/repositories/xperience/CMSSolution/EventLog/` | Event logging infrastructure |
| `./resources/repositories/xperience/CMSSolution/Scheduler/` | Scheduled task processing, background workers, scheduling executor |
| `./resources/repositories/xperience/CMSSolution/ContinuousIntegration/` | CI repository serialization/storage infrastructure |
| `./resources/repositories/xperience/CMSSolution/WebFarmSync/` | Web-farm synchronization tasks, servers, monitoring |
| `./resources/repositories/xperience/CMSSolution/LicenseProvider/` | License validation, retrieval, serialization, scheduled tasks |

## Key Concepts

- `DataEngine/` is the generic object/data substrate beneath many feature libraries. It is one of the most important source roots in the solution.
- `DbDataManager/` owns installation, schema evolution, and update mechanics rather than day-to-day domain behavior.
- `DataProtection/` is its own subsystem with explicit consent and data-subject-rights handling.
- `MacroEngine/` is a reusable runtime subsystem for expression evaluation across features.
- Notifications, event logging, scheduling, CI serialization, licensing, and web-farm sync are horizontal operational services used by many product areas.
- These roots are platform-critical even when they are not directly user-facing.

## Important Entry Points

| Kind | Path | Why it matters |
|---|---|---|
| Generic data layer | `./resources/repositories/xperience/CMSSolution/DataEngine/Query/` | Core query infrastructure |
| Object/data classes | `./resources/repositories/xperience/CMSSolution/DataEngine/Classes/` | Core object/data model anchors |
| Installation/update | `./resources/repositories/xperience/CMSSolution/DbDataManager/Installation/` | Setup and upgrade entry surface |
| Data subject rights | `./resources/repositories/xperience/CMSSolution/DataProtection/DataSubjectRights/` | GDPR data access/erasure surface |
| Localization | `./resources/repositories/xperience/CMSSolution/Globalization/Localization/` | Localization anchor |
| Macro resolution | `./resources/repositories/xperience/CMSSolution/MacroEngine/Resolver/` | Macro execution and resolution anchor |
| Notification queue | `./resources/repositories/xperience/CMSSolution/Notifications/NotificationQueue/` | Horizontal notification processing anchor |
| Scheduler tasks | `./resources/repositories/xperience/CMSSolution/Scheduler/Tasks/` | Scheduled-task execution surface |
| CI repository | `./resources/repositories/xperience/CMSSolution/ContinuousIntegration/Repository/` | CI serialization storage anchor |
| Web-farm tasks | `./resources/repositories/xperience/CMSSolution/WebFarmSync/Tasks/` | Multi-node synchronization anchor |

## Cross-References

- Solution foundations: `source-solution-foundations.md`
- Integrations and storage: `source-integrations-and-storage.md`
- Marketing and engagement: `source-marketing-and-engagement.md`
