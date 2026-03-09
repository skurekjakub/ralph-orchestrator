---
name: ralph-codesamples-adminui
description: "Interact with the Xperience by Kentico admin UI via Playwright for creating and managing objects that cannot be created via code alone — promotions, taxonomies, shipping methods, order statuses, content items. Use this skill when the task requires creating admin-managed objects, the trigger includes an adminui parameter, or when objects must be persisted via CI store."
---

# Codesamples Admin UI Skill

How to interact with the Xperience by Kentico admin UI via Playwright for creating and managing objects.

The admin UI is a **React SPA** with client-side routing. All pages load asynchronously — you will see a "Preparing your Xperience" splash before the real content renders. Always wait for `networkidle` + a short timeout after navigation.

## Strategy: Explore First, Then Act

**Always screenshot before interacting.** The admin UI has many conditional fields, dynamic sections, and context-specific controls. Before filling any form:

1. Navigate to the target page
2. Wait for load (`networkidle` + `waitForTimeout(3000)`)
3. Screenshot to see what's on the page
4. Read the accessibility snapshot to identify exact element roles, labels, and structure
5. Only then interact with elements using the exact selectors from the snapshot

**Never hard-code selectors you haven't verified.** Even this skill document may not cover every edge case — always confirm with a screenshot.

## Evidence Screenshots

**Save a screenshot to `/tmp/mcp-attachments/` after every key interaction.** These are attached to the JIRA issue during handoff as visual evidence of admin UI work.

Use sequential numbering with a descriptive suffix:

```bash
playwright-cli screenshot --filename=/tmp/mcp-attachments/adminui-01-login.png
playwright-cli screenshot --filename=/tmp/mcp-attachments/adminui-02-discount-form.png
playwright-cli screenshot --filename=/tmp/mcp-attachments/adminui-03-discount-saved.png
```

**When to screenshot:**
- After successful login (dashboard visible)
- After navigating to a target section (list view loaded)
- After filling a form (before clicking Save/Continue)
- After saving/creating an object (success state)
- After any verification step (e.g., confirming object appears in the list)

The handoff workflow automatically attaches all files from `/tmp/mcp-attachments/` to JIRA.

## Access

- **URL:** `localhost:666/admin`
- **Login:** `administrator` / `admin`
- **Prerequisite:** The codesamples server must be running (`npm run codesamples:serve`)

## Login Flow

```
Navigate to localhost:666/admin → redirects to /admin/logon
Fill textbox "User name"  → administrator
Fill textbox "Password"   → admin
Click button "Sign in"
Wait for networkidle + 3s → dashboard loads at /admin/dashboard
```

## Admin Navigation

The left sidebar has 5 category buttons. Clicking one expands its sub-application list. Use direct URL navigation instead — it's faster and more reliable.

| Section | URL | Sidebar Category |
|---------|-----|-----------------|
| Dashboard | `/admin/dashboard` | — |
| Content hub | `/admin/content-hub` | Content management |
| Content types | `/admin/content-types/list` | Configuration |
| Taxonomies | `/admin/taxonomy/list` | Configuration |
| Catalog discounts | `/admin/promotions/catalog-promotions` | Digital commerce |
| Order discounts | `/admin/promotions/order-promotions` | Digital commerce |
| Order statuses | `/admin/commerce-configuration/order-statuses` | Configuration |
| Shipping methods | `/admin/commerce-configuration/shipping-methods` | Configuration |
| Payment methods | `/admin/commerce-configuration/payment-methods` | Configuration |

## UI Patterns

### List Views

Most sections open with a list view — either a **table** (Content types, Shipping methods, Payment methods, Catalog discounts, Order discounts) or a **special layout** (Content hub uses cards, Order statuses uses an inline-edit list, Taxonomies uses a tree).

- Lists with tables: `row` elements with `cell` children. Click the row link to navigate to the detail page.
- "NEW ..." button at the top is a `link` role (not `button`), e.g.: `page.getByText('NEW CONTENT TYPE').click()`

### Form Components

Forms use these component types — use the corresponding Playwright selectors:

| Component | Selector Pattern | Notes |
|-----------|-----------------|-------|
| Text input | `page.getByRole('textbox', { name: '* Field name' })` | Required fields have `*` prefix in the label |
| Textarea | `page.getByRole('textbox', { name: 'Description' })` | Same role as text input, but renders multiline |
| Radio group | `page.getByRole('radio', { name: 'Option name' })` | Wrapped in a `radiogroup` container |
| Checkbox | `page.getByRole('checkbox', { name: 'Label' })` | Standard checkbox role |
| Combobox/dropdown | `page.getByRole('combobox')` | Has a nested textbox "Choose an option" — click to expand, then click the option |
| Tag selector | `page.getByRole('button', { name: 'Select tags' })` | Opens a modal dialog (see Dialog Pattern below) |
| Rich text editor | Special — see Rich Text section | Froala-based, not a standard textbox |
| Collapsible section | `page.getByText('Identifiers')` + click the adjacent button | Expands to reveal code name / GUID fields |

### Dialog Pattern (Tag Selector, Confirmations)

Dialogs render as overlay modals that intercept pointer events. You **must** interact with dialog buttons directly — elements behind the overlay are not clickable.

**Tag selector dialog:**
```
Click button "Select tags"  → modal opens with heading "Select tags"
TreeView shows taxonomies → tag tree items have checkbox roles
Check desired tags          → page.getByRole('checkbox', { name: 'Tag name' }).check()
Click button "Select"       → confirms selection, closes modal
```

**Confirmation dialogs:**
```
Title bar + message + action buttons (e.g., CANCEL / REVERT TO PUBLISHED)
Always read the snapshot to get exact button names.
```

### Rich Text Editor

The Content hub uses a Froala-based rich text editor. It does NOT have a standard `textbox` role. To interact:

1. Locate the editor container (usually the element after the "Product description" label)
2. Click into it to focus
3. Type content or use keyboard shortcuts
4. The toolbar offers: Bold, Italic, Underline, Paragraph Format (H1–H6), Lists, Alignment, Code View, Insert Image, Insert Link, Undo/Redo

### Content Versioning (Content Hub Only)

Content items in the Content hub have a publish/draft workflow:

- **View mode**: Fields are read-only. Button "EDIT CONTENT ITEM" at top.
- **Edit mode**: Clicking edit creates a **new draft version** automatically ("Draft (New version)" badge appears). PUBLISH and SAVE buttons appear.
- **Publish**: Click the PUBLISH button to publish the draft.
- **Revert**: Click the dropdown arrow next to PUBLISH → "Revert to published" → confirmation dialog with CANCEL / REVERT TO PUBLISHED buttons.

**Warning:** Clicking "Edit content item" is not idempotent — it creates a new version each time. If you click edit by accident, revert before navigating away.

## Object Creation Workflows

### Create a Catalog Discount

```
Navigate to /admin/promotions/catalog-promotions
Click text "NEW DISCOUNT"  (link role, not button)
→ navigates to /admin/promotions/catalog-promotions/create
→ form has CONTINUE button (instead of Save — used for initial creation)

Fill fields:
  textbox "* Discount name"        → e.g., "Codesamples-summer-sale"
  textbox "Description"            → optional
  radiogroup "Target customers"    → default "All visitors"
  radiogroup "Redemption method"   → default "Automatic"
    (if "Generic discount code" selected → textbox "* Discount code" appears)
  combobox "Discount type"         → default "Percentage"
  textbox "* Discount value"       → e.g., "10"
  button "Select tags"             → optional, opens tag picker for Product categories

Click button "CONTINUE" to create
```

### Create an Order Discount

```
Navigate to /admin/promotions/order-promotions
Click text "NEW DISCOUNT"
→ same form as catalog discount, plus:
  combobox "Discount rule"         → (may be pre-set/disabled)
  radiogroup "Minimum purchase requirements" → No minimum / Minimum purchase amount / Minimum quantity of items
    (conditional fields appear based on selection)
```

### Create a Shipping Method

```
Navigate to /admin/commerce-configuration/shipping-methods
Click text "New shipping method"  (link role)
→ navigates to create page

Fill fields:
  textbox "* Shipping method name"  → e.g., "Codesamples-express"
  textbox "Description"             → optional
  checkbox "Enabled"                → toggle
  textbox "Shipping price"          → decimal or whole number, e.g., "15.00"
```

### Create an Order Status

```
Navigate to /admin/commerce-configuration/order-statuses
Click text "NEW ORDER STATUS"  (link role)
→ inline form appears in the list (not a separate page!)

Fill fields:
  textbox "* Order status name"  → e.g., "Codesamples-processing"
  Identifiers section            → expand to set code name
  Notifications checkboxes       → optional

Click button "Save" (inline save, not a full page submit)
```

Order statuses also support **drag-to-reorder** in the list.

### Create a Taxonomy / Tag

```
Navigate to /admin/taxonomy/list
Click text "NEW TAXONOMY"  (link role)
→ new taxonomy appears in tree view on left

Fill fields in right panel:
  textbox "* Taxonomy name"  → e.g., "Codesamples-product-type"
  textbox "Description"      → optional

Click button "SAVE"

To add tags under a taxonomy:
  Click the taxonomy in the tree → click "NEW TAG"
  → child tag appears in tree, fill name in right panel, SAVE
```

### Create a Content Item (Content Hub)

```
Navigate to /admin/content-hub
Click text "NEW CONTENT ITEM"  (link role)
→ content type selector appears (if multiple types exist)
→ for this sample project: only "Product" type (Codesamples.ProductSKU)

Fill fields:
  textbox "Product name"           → required
  Rich text "Product description"  → use Froala editor (click into editor area, type)
  textbox "Product price"          → decimal number
  button "Select tags"             → Product category tags

Click button "PUBLISH" to publish immediately, or "SAVE" to save as draft
```

## CI Persistence

After creating objects via the admin UI, they are automatically serialized to the cirepository as XML files.

This serializes admin-created objects to XML files in `src/_code/src/Website/App_Data/CIRepository/`. Verify new XML files appear after running the command.

**Code name convention:** All objects must use the `codesamples` prefix in their code names for CI serialization to pick them up correctly.

## `repository.config` Whitelisting

If new object types don't serialize after running `codesamples:store`:

1. Check `repository.config` in the project root
2. Add the missing object type to the whitelist:

```xml
<ObjectType>cms.taxonomy</ObjectType>
```

## Async Loading

The admin UI loads asynchronously. After every navigation or action:

```javascript
await page.waitForLoadState('networkidle');
await page.waitForTimeout(3000);
```

Always take a screenshot after waiting to verify the page has fully rendered before interacting with elements.
