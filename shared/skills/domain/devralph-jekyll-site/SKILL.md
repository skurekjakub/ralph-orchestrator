---
name: devralph-jekyll-site
description: "Jekyll site structure reference covering collections (7 active + legacy archives), layouts (8 templates), includes (component hierarchy), data files (pagetree YAML), frontmatter conventions, content organization, and the multi-file config overlay system. Use this skill whenever you modify layouts or includes under src/_layouts/ or src/_includes/, change navigation or pagetree data, add or reorganize collections, edit frontmatter conventions, or need to understand identifier-based cross-referencing — the site's component hierarchy and collection metadata drive both navigation and rendering, so changes to one layer often require coordinated updates in another."
---
{% raw %}

# Jekyll Site Structure

Content lives under `src/` following Jekyll conventions with a custom `collections_dir`.

## Configuration

### Multi-File Config Overlay

The site uses **multiple YAML config files** merged at build time:

- `src/_configs/_config_primary.yml` (445 lines) — main config
- `src/_configs/_config_development.yml` — local dev overrides
- `src/_configs/infrastructure/` — mode-specific configs (serve, test, algolia, AIRA, validation)
- `src/_jekyllConfigFinal.yml` — auto-generated merged output

Key settings:
- **Markdown converter:** `KenticoPandoc` (custom, from `jekyll-kentico-customizations` gem)
- **Default layout:** `page`
- **Permalink:** `/:collection/:path`
- **Collections dir:** `_documentation`
- **Learn portal:** enabled per-collection via `learn_portal: true`

## Collections

All collections live under `src/_documentation/`.

### Active Collections

| Collection | Pages | Purpose |
|------------|-------|---------|
| `documentation` | ~1,794 | Xperience by Kentico main docs |
| `guides` | ~308 | Architecture, implementation, migration guides |
| `api` | ~22 | API examples |
| `modules` | ~67 | Learn Portal modules |
| `paths` | ~11 | Learning paths |
| `personas` | ~7 | Persona-based search landing pages |
| `samples` | ~5 | Jekyll samples |

### Legacy Collections (output: false)

`13`, `13tutorial`, `13api`, `k12sp`, `k11`, `k10`, `k9`, `k82`, `k81`, `k8` + their tutorials and API variants — ~9,500+ pages of archived docs.

### Collection Metadata

Each collection defines: `title`, `permalink`, `product_version` (`xbyk`/`learn_portal`), `related_collections`, `helpServiceVersion`, `docsbot`, `supported`, `feedback_button`, `license_info`, `learn_portal`.

## Layouts (`src/_layouts/`)

| Layout | Purpose |
|--------|---------|
| `page.liquid` | **Default** — left sidebar (pagetree), right sidebar (ToC + related pages), breadcrumbs |
| `homepage.liquid` | Collection home pages — no right sidebar, optional search |
| `module_page.liquid` | Learn Portal module pages — module navigation sidebar |
| `path_page.liquid` | Learning paths — banner + module sequence |
| `search.liquid` | Search results — filter sidebar + Algolia hits |
| `search_portal.liquid` | Learn Portal search — combined search + filter |
| `error.liquid` | 404 page |
| `aira.liquid` | AIRA chatbot page (minimal) |

All layouts are standalone (no inheritance). Each includes common partials: `globals.liquid`, `include-htmlhead.liquid`, `include-headerbar.liquid`, `include-bodyendscripts.liquid`, `page-footer.liquid`, `cookiebanner.liquid`.

## Includes (`src/_includes/`)

### Top-Level Includes

| Include | Purpose |
|---------|---------|
| `globals.liquid` | Sets `currentCollection`, `pageCollection`, `homeUrl`, `product_version` |
| `include-htmlhead.liquid` | `<head>` element (CSS, meta, favicon, OG tags) |
| `include-headerbar.liquid` | Site header with navigation |
| `include-content.liquid` | Routes to `content-page.liquid` or `content-module.liquid` |
| `include-bodyendscripts.liquid` | JS includes at body end |

### Component Directories

| Directory | Components |
|-----------|-----------|
| `components/banners/` | Old/new version warning banners |
| `components/breadcrumbs/` | Breadcrumb navigation (recursive) |
| `components/content/` | Page and module content rendering |
| `components/footer/` | Content footer, feedback collector, back-to-top |
| `components/header/` | Collection switcher, mobile nav, main navigation |
| `components/htmlhead/` | Canonical URL, CSS links, favicon, meta, OG tags |
| `components/k12-support/` | Legacy K12 dev model switcher |
| `components/misc/` | Cookie banner, noscript, reading mode |
| `components/page/` | Page metadata, dev model switcher, advisory links |
| `components/search/` | Search banners, search fields |
| `components/sidebar/` | Left sidebar (pagetree nav), right sidebar (ToC), filters |
| `learn_portal/modules/` | Module-specific navigation |

## Data Files (`src/_data/`)

### Pagetree Navigation

```
_data/pagetree/
  ├── api.yml
  ├── documentation.yml    ← largest, main docs nav tree
  ├── guides.yml
  ├── personas.yml
  └── samples.yml
```

Structure: nested trees with `title`, `identifier`, `order`, `url`, `children` arrays. Used by the pagetree sidebar to render left navigation.

## Frontmatter Conventions

| Field | Usage | Example |
|-------|-------|---------|
| `title` | Page display title | `"Content types"` |
| `order` | Sort order within parent | `300` (increments of 100) |
| `identifier` | **Unique page ID** — used by `page_link` | `gYHWCQ` (short alphanumeric) |
| `redirect_from` | URL redirects (includes `x/IDENTIFIER` short links) | `x/gYHWCQ` |
| `persona` | Target personas for search faceting | `developer, admin` |
| `toc` | Right sidebar ToC config | `{minHeadingLevel: 1, maxHeadingLevel: 3}` |
| `related_pages` | Array of identifiers for related pages | `['D4_OD', 'ABC123']` |
| `license` | License tier | `1` |
| `searchable` | Exclude from search index | `false` |
| `layout` | Override default layout | `homepage` |
| `pagetree` | Exclude from pagetree nav | `false` |

## Content Organization

### Hierarchy Pattern

```
_documentation/
  developers-and-admins.md        ← Section landing page
  developers-and-admins/          ← Child folder
    development.md                ← Sub-section landing page
    development/                  ← Child folder
      caching.md                  ← Leaf page
      content-types.md            ← Another leaf page
```

Every collection directory = parent page. Every `.md` file = content page. Same-level pages sorted by `order` frontmatter (increments of 100).

### Docs Assets

`src/_docsassets/` mirrors collection structure — screenshots/images referenced by `{% image filename %}` (auto-resolved to collection's asset folder).

### Code Samples

`src/_code/src/` contains a .NET solution referenced by `{% code_link source="path" lang="csharp" %}`.

### Learn Portal Content

```
src/_documentation/
  _<collection>/
    _modules/
      <slug>/<slug>.yml + optional pages
    _paths/
      <slug>/<slug>.yml + landing.md
```

## Custom Liquid Tags Quick Reference

Heavily used in content:
- `{% page_link IDENTIFIER linkText="..." %}` — Cross-reference (~8,795 uses)
- `{% inpage_link "Heading" linkText="..." %}` — In-page anchor link (~1,512 uses)
- `{% external_link "URL" linkText="..." %}` — External link (~1,304 uses)
- `{% code lang=LANG title="..." %}...{% endcode %}` — Code blocks (~1,336 pairs)
- `{% image FILENAME title="..." %}` — Doc asset images (~417 uses)
- `{% info %}...{% endinfo %}` — Info callout (~398 pairs)
- `{% note %}...{% endnote %}` — Note callout (~327 pairs)
- `{% tip %}...{% endtip %}` — Tip callout (~206 pairs)

{% endraw %}
