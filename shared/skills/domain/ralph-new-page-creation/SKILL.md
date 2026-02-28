---
name: ralph-new-page-creation
description: "Rules for creating new Markdown documentation pages including frontmatter schema, identifiers, persona assignment, ordering, and licensing. Use this skill whenever creating a new documentation page, adding a new file to the docs site, setting up YAML frontmatter for a new page, or when the task mentions adding new content that doesn't have an existing page."
---

# New Page Creation Skill

Rules for creating new Markdown documentation pages for the Xperience by Kentico docs site.

## Documentation Page Creation Rules

**Context:** Creating new Markdown documentation pages for the Xperience by Kentico solution.
**Format:** Jekyll-based Markdown with YAML Frontmatter.

### File Naming Conventions

- **Source:** `~/src/_documentation/<audience>/<filename>.md`
- **Slug Logic:** The filename determines the URL slug.
- **Syntax:**
  - Must reflect the page title.
  - Must use hyphens (`-`) as word separators (kebab-case).
  - Example: Title "Business user pages" -> Filename `business-user-pages.md`.

### Frontmatter Schema (YAML)

The following properties must appear at the top of the `.md` file between triple dashes (`---`).

| Property | Required | Type | Valid Values / Constraints |
| :--- | :--- | :--- | :--- |
| `title` | **Yes** | String | The display title of the page. |
| `persona` | **Yes** | String/List | Target audience. Comma-separated for multiple. **Enums:** `developer`, `admin`, `business`, `architect`, `all`. |
| `identifier` | **Yes** | String | Unique ID. Syntax: `{code_name}_{collection_suffix}`. |
| `order` | **Yes** | Integer | Hierarchy sorting index. Start at 100. |
| `license` | **Conditional** | String/Int | Tier level. Default is `1` (Standard). Mandatory for `_documentation` and `_guides`. |
| `redirect_from` | **Yes** | List | Legacy links. Must include `x/<identifier>`. |
| `searchable` | No | Boolean | `true` or `false`. Defaults to true if omitted. |

### Identifier Logic

- **Structure:** A unique code name followed by a collection suffix.
- **Formatting:** Snake_case.
- **Suffixes:** `_guides`, `_xp`, or `_collection`.
- **Example:** For a "Website Channels" page in the guides collection, use `website_channels_guides`.
- **Constraint:** Must be unique across the help service.

**Legacy identifiers** (opaque hashes like `H5jWCQ`, `DgqiCQ`) exist from Confluence migration — never create new ones in this format. Always use the modern descriptive format.

**Three-way sync:** Identifiers connect the page frontmatter, the navigation tree (`documentation.yml`), and every `page_link` referencing the page. All three must match exactly — if any are out of sync, the build fails.

Before choosing an identifier, verify it's not already taken:
```bash
grep -r "identifier: my_proposed_id" src/_data/ src/_documentation/
```

### Persona Assignment Strategy

- **General/All:** Use `all`.
- **Developer Guides:** `developer` (add `admin`, `architect` if relevant).
- **Business Guides:** `business` (add `architect` if relevant).
- **Architecture:** `architect` (add `admin`, `developer` if relevant).
- **Config/User Roles:** `admin`, `developer`.

### Order (Sorting) Logic

- **New Subtrees:** Start at `100`, increment by 100 (`100`, `200`, `300`).
- **Insertions:** Use the mathematical midpoint.
  - *Example:* Inserting between 500 and 600 -> `550`.
  - *Collision:* If `550` exists, split to `533` and `566`, or `525` and `575`.

### Licensing Features

- **Page Level:** Set `license: 1` for standard tier. Consult dev team for higher tiers.
- **Inline (Partial) Licensing:** Do not use frontmatter for section-specific licensing. Instead, use the Liquid tag:
  ```liquid
  {% raw %}{% license_info %} Custom message for specific feature {% endlicense_info %}{% endraw %}
  ```
  *Note: Content inside license tags is excluded from search indexing.*

### Example (Valid Frontmatter)

```yaml
---
title: Administration interface basics
persona: business
identifier: website_channels_xp
order: 100
license: 1
redirect_from:
  - x/website_channels_xp
  - xperience-interface-basics
---
```

### Registering in documentation.yml

Every new page in the documentation collection **must** have a matching entry in `src/_data/pagetree/documentation.yml` (or `guides.yml` for guides). Without it, the page won't appear in navigation and `page_link` references will fail.

Find the parent section and insert:
```yaml
- title: Administration interface basics
  identifier: website_channels_xp
  order: 100
  url: /documentation/developers-and-admins/development/administration-interface-basics
  children: []
```

**Rules:**
- `title` and `identifier` must match the page's frontmatter exactly
- `url` is the generated URL path (kebab-case, derived from folder structure)
- `order` controls sort order within siblings (use 100-increments)
- `children` is always present (empty array `[]` for leaf pages)

Run `npm run build` after adding the entry to validate identifier uniqueness and link integrity.
