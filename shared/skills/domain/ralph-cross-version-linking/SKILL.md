---
name: ralph-cross-version-linking
description: "How to link across documentation collections (documentation, guides, api) using the collection parameter on page_link and card tags. Use this skill when a page in one collection needs to reference a page in a different collection — cross-collection links require the collection parameter or the build silently generates a broken link."
---
{% raw %}

# Cross-Collection Linking

The docs site has multiple Jekyll collections, each with its own page tree. Links between collections require the `collection` parameter — without it, page_link only searches the current collection's tree.

## Collections in use

| Collection | Path prefix | Pagetree file | Content scope |
|------------|-------------|---------------|---------------|
| `documentation` | `/documentation/` | `documentation.yml` | Main Xperience by Kentico docs |
| `guides` | `/guides/` | `guides.yml` | Training guides and tutorials |
| `api` | `/api/` | `api.yml` | API reference and code examples |

Legacy collections (K8, K9, K10, K11, K12SP, 13, 13api, 13tutorial) also exist but new docs pages target the main three.

## Linking across collections

**From documentation → guides:**
```liquid
{% page_link setup_guide_identifier collection="guides" linkText="Getting started guide" %}
```

**From guides → api:**
```liquid
{% page_link api_example_identifier collection="api" linkText="See API example" %}
```

**Card linking across collections:**
```liquid
{% card link=guide_identifier collection="guides" title="Related Guide" %}
Check out the getting started guide.
{% endcard %}
```

## When collection is required

- **Same collection:** No `collection` parameter needed — page_link resolves within the current collection's tree automatically.
- **Different collection:** `collection` parameter is **required**. Without it, the identifier won't be found in the current collection's tree and the build produces an error.

## How to determine the collection

Look at where the target page's `.md` file lives:
- `src/_documentation/_documentation/` → collection `documentation`
- `src/_documentation/_guides/` → collection `guides`
- `src/_documentation/_api/` → collection `api`

Or check which pagetree YAML file contains the target identifier.

## Common mistake

Forgetting the `collection` parameter when linking from a guide page to the main documentation. The link renders but may point to the wrong page or produce a build error if the identifier isn't found.
{% endraw %}
