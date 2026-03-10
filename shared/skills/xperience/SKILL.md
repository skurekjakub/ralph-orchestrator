---
name: xperience
description: A router skill for working with Xperience by Kentico source code and product internals. Use this skill whenever you need to orient yourself in the CMSSolution codebase, identify which subsystem owns a feature, map documentation topics to source roots, or find the right product area before doing deeper research. Use it for source-structure questions even when the user only mentions a feature name and not the repository layout explicitly.
---

# Xperience by Kentico Source Map

This skill maps the major source-code areas under `./resources/repositories/xperience/CMSSolution/`.

Use it to answer questions like:

- which subsystem owns this feature
- where a documentation topic maps into product source code
- which root directories matter before doing detailed code search
- how product surfaces relate to each other at a high level

For documentation-tree orientation rather than source-tree orientation, use the companion `xperience-documentation` skill.

## Solution and Platform Structure

- [Solution foundations](references/source-solution-foundations.md) — solution-level build/config anchors plus the shared platform roots such as `Base`, `Core`, `Helpers`, and `Modules`
- [Data, security, and operations](references/source-data-security-operations.md) — `DataEngine`, `DbDataManager`, `DataProtection`, `MacroEngine`, `Scheduler`, `ContinuousIntegration`, `WebFarmSync`, and other horizontal runtime services
- [Integrations and storage](references/source-integrations-and-storage.md) — external integration packages plus the internal file/storage abstraction layer in `IO`
- [Tooling, samples, and tests](references/source-tooling-samples-tests.md) — analyzers, templates, internal tools, samples, and subsystem-oriented test projects

## Product Surfaces

- [Content and channels](references/source-content-and-channels.md) — `ContentEngine`, `Websites`, `Headless`, `MediaLibrary`, workflow, sync, and workspaces
- [Admin and web runtime](references/source-admin-and-runtime.md) — `Admin`, `Mvc`, `Routing.Web`, `Membership`, and `AIRA`
- [Marketing and engagement](references/source-marketing-and-engagement.md) — activities, contacts, automation, journeys, email, forms, and online marketing
- [Commerce](references/source-commerce.md) — customers, carts, orders, pricing, promotions, payments, and shipping

## Deep Topic References

- [Page permissions](references/page-permissions.md) — the website page permission model: application access, page ACLs, workflow roles, the Read prerequisite rule, and operation-to-permission mapping
