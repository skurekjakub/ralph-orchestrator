---
name: xperience-documentation
description: A skill that maps the structure of the Xperience by Kentico documentation — what areas exist, what each section covers, how pages relate to each other, and where the corresponding source code lives. Use this skill whenever you need to understand the documentation hierarchy, find where a topic is documented, identify related pages across sections, plan documentation changes, or understand how the docs map to the Xperience source code. This skill is especially important when working on documentation tasks, writing new pages, restructuring existing content, identifying cross-references, or orienting yourself in the kentico-docs-jekyll repository. Use it even when the user just mentions "the docs" or "documentation structure" — it covers both business-user and developer-facing sections comprehensively.
---

# Xperience by Kentico Documentation Structure

A reference for the structure and content areas of the Xperience by Kentico documentation, located at `./src/_documentation/_documentation/` in the kentico-docs-jekyll repository.

The documentation has two main sections: **Business users** (end-user guides for content editors, marketers, and administrators using the Xperience admin UI) and **Developers and admins** (technical guides for developers building on and configuring the platform).

Each reference below covers one documentation area — its page hierarchy, what each page covers, and where the corresponding source code lives in `./resources/repositories/xperience/CMSSolution/`.

## Business Users Section

These references cover the admin UI guides aimed at content editors and marketers.

- [Content hub](references/business-content-hub.md) — Content items, folders, and content item assets in the Content hub application
- [Website content](references/business-website-content.md) — Pages, page builder, URLs, templates, translations, permissions, and the website content tree
- [Digital marketing](references/business-digital-marketing.md) — Contact management, email campaigns, forms, automation, customer journeys, and widget personalization
- [Media libraries](references/business-media-libraries.md) — Media library creation and file management
- [General features](references/business-general.md) — Headless content, content sync, content versioning, email queue, members, recycle bin, rich text editor, commerce stores, AIRA, and user profiles

## Developers and Admins Section

### Development

Core website and content development guides.

- [Content types](references/dev-content-types.md) — Content type modeling, reusable field schemas, page creation limits, MCP support
- [Builders](references/dev-builders.md) — Page builder (widgets, sections, templates, editable areas), form builder (components, sections, validation), and email builder
- [Content retrieval](references/dev-content-retrieval.md) — Retrieving pages, headless items, content items, and media library files
- [Routing](references/dev-routing.md) — Content tree-based routing, custom redirects, forbidden URL characters
- [Caching](references/dev-caching.md) — Data caching, output caching, file caching, cache dependencies
- [Authentication & membership](references/dev-auth.md) — Member registration, forms authentication, external authentication, member roles, custom member fields
- [Website development basics](references/dev-website-basics.md) — New project setup, dependency injection, local hosting

### Customization

Extending and customizing the Xperience platform.

- [Admin UI extension](references/dev-admin-ui.md) — UI pages, UI form components, editing components, localization, admin UI testing
- [Object types & field editor](references/dev-object-types-and-fields.md) — Custom object types, object type configuration, field editor, data type management
- [Events, providers & custom code](references/dev-events-and-customization.md) — Global events, system providers, scheduled tasks, custom endpoints, startup code, email customization, stable API guidelines

### Configuration

System configuration and administration.

- [Configuration](references/dev-configuration.md) — Website channels, headless channels, users/roles, workflows, languages, taxonomies, macros, RTE config, email, media libraries, settings, and more
- [API](references/dev-api.md) — Content item API, content retriever, ObjectQuery, management API, files API, external API usage, code generation
- [CI/CD](references/dev-ci-cd.md) — Continuous integration, continuous deployment, repository structure, database migrations, configuration templates

### Digital Marketing & Commerce Setup

Developer-side setup for marketing and commerce features.

- [Digital marketing setup](references/dev-digital-marketing-setup.md) — Contact configuration, email channels, email templates, tracking, personalization, CDP, activities, subscriptions, form autoresponders
- [Digital commerce setup](references/dev-digital-commerce.md) — Commerce architecture, product catalog, pricing, checkout, orders, promotions, shipping/payment, order statuses

### Operations & Infrastructure

Installation, deployment, security, and platform operations.

- [Deployment & SaaS](references/dev-deployment-and-saas.md) — SaaS deployments, private cloud, read-only deployments, Xperience Portal, SaaS service plans, proxy servers
- [Installation & upgrade](references/dev-installation-and-upgrade.md) — System requirements, installation, project updates, licenses, MCP server, support policy, upgrade/migration toolkit
- [Security & data protection](references/dev-security-and-data-protection.md) — Security guidelines, rate limiting, GDPR compliance, consents, personal data collection/erasure, cookies
