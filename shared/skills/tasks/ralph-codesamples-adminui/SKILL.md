---
name: ralph-codesamples-adminui
description: "Interact with the Xperience by Kentico admin UI via Playwright for creating and managing objects that cannot be created via code alone — promotions, taxonomies, shipping methods, order statuses. Use this skill when the task requires creating admin-managed objects, the trigger includes an adminui parameter, or when objects must be persisted via CI store."
---

# Codesamples Admin UI Skill

How to interact with the Xperience by Kentico admin UI for creating and managing objects that cannot be created via code alone.

## Access

- **URL:** `localhost:666/admin`
- **Credentials:** `administrator` / `admin`
- **Prerequisite:** The codesamples server must be running (`npm run codesamples:serve`)

## Navigation Patterns (via playwright-cli)

| Section | URL |
|---------|-----|
| Content tree | `/admin/content` |
| Settings | `/admin/settings` |
| Promotions | `/admin/commerce/promotions` |
| Shipping | `/admin/commerce/shipping` |
| Order statuses | `/admin/commerce/order-statuses` |
| Taxonomies | `/admin/taxonomies` |

## Object Creation Workflows

### Promotions

1. Navigate to Commerce → Promotions → Create
2. Fill in promotion details (code name with `codesamples` prefix, display name, discount type, conditions)
3. Save → verify success toast
4. Run `npm run codesamples:store` to persist to CI

### Taxonomies

1. Navigate to Taxonomies → Create taxonomy
2. Fill in taxonomy details (code name with `codesamples` prefix, display name, tags)
3. Save → verify success toast
4. Run `npm run codesamples:store` to persist to CI

### Shipping Methods

1. Navigate to Commerce → Shipping → Create
2. Fill in shipping method details (code name with `codesamples` prefix, display name, carrier, pricing)
3. Save → verify success toast
4. Run `npm run codesamples:store` to persist to CI

### Order Statuses

1. Navigate to Commerce → Order statuses → Create
2. Fill in status details (code name with `codesamples` prefix, display name, color)
3. Save → verify success toast
4. Run `npm run codesamples:store` to persist to CI

## CI Persistence

After creating objects via the admin UI, serialize them to XML:

```bash
npm run codesamples:store
```

This serializes admin-created objects to XML files in `CIRepository/`. Verify new XML files appear after running the command.

**Code name convention:** All objects must use the `codesamples` prefix in their code names for CI serialization to pick them up correctly.

## `repository.config` Whitelisting

If new object types don't serialize after running `codesamples:store`:

1. Check `repository.config` in the project root
2. Add the missing object type to the whitelist:

```xml
<ObjectType>cms.taxonomy</ObjectType>
```

## Playwright Interaction Patterns

### Login Flow

1. Navigate to `localhost:666/admin`
2. Fill username field with `administrator`
3. Fill password field with `admin`
4. Click "Sign in"
5. Wait for the dashboard to load (wait for network idle)

### Form Filling

1. Navigate to the target section
2. Wait for the form to render
3. Fill required fields
4. Click Save
5. Wait for success toast notification
6. Take a screenshot for verification evidence

### Important: Async AJAX Handling

The admin UI uses asynchronous AJAX calls. After any action:

- Wait for network idle before asserting results
- Take before/after screenshots for verification evidence
- Verify success toasts appear before moving to the next step
