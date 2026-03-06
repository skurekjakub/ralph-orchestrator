---
name: devralph-frontend
description: "Frontend architecture reference covering JavaScript (ES modules + Webpack, 4 bundles: theme, Algolia search, DocsBot, learn portal), jQuery patterns, Tailwind v4 CSS-first config, Less legacy styling, and third-party libraries. Use this skill whenever you write or modify JavaScript under src/_assets/js/, add UI components, fix Algolia search behavior, work with CSS (Less or Tailwind), add @source directives for Tailwind class scanning, or need to understand bundle structure — the site runs a dual CSS system where knowing which to use and how they interact prevents subtle styling conflicts."
---
{% raw %}

# Frontend Architecture

All frontend code lives in `src/_assets/`.

## JavaScript Architecture

### Module System

ES modules (`import`/`export`) transpiled by Babel, bundled by Webpack into 4 bundles exposed as global `var` libraries.

### Bundles

| Bundle | Entry | Global | Purpose |
|--------|-------|--------|---------|
| `kenticoTheme.min.js` | `js/modules/index.js` | `kenticoTheme` | Core site UI |
| `kenticoAlgolia.min.js` | `js/algolia/index.js` | `kenticoAlgolia` | Full-text search |
| `kenticoDocsbot.min.js` | `js/docsbot/index.js` | `kenticoDocsbot` | AI chat widget |
| `learnPortal.min.js` | `js/learnPortal/index.js` | `learnPortal` | Tutorial/learning portal |

### Core Theme Modules (`js/modules/`)

| Module | Purpose |
|--------|---------|
| `init.js` | Bootstrap: jQuery `$(document).ready()`, initializes all components |
| `header.js` | Mobile hamburger menu, scroll-to-anchor offsetting for fixed header |
| `pageTree.js` | Sidebar navigation tree, auto-scroll to current page |
| `prism.js` | PrismJS setup with 15+ language grammars + line-highlight/line-numbers |
| `versionSwitcher.js` | Product version dropdown with version-specific URL rewriting |
| `keyboardShortcuts.js` | `Alt+T` (page tree), `Alt+R` (reading mode) |
| `feedbackCollector.js` | DocsBot-powered feedback form |
| `readingModeSwitcher.js` | Layout mode toggle via `localStorage` |
| `sidebarHider.js` | Sidebar collapse toggle via `localStorage` |
| `devFrameworkSwitcher-12.js` | KX12 version content filtering |
| `devFrameworkSwitcher-13.js` | KX13 version content filtering |

### Algolia Search (`js/algolia/`)

10 component directories using a custom widget pattern:

- `SearchClient` — Algolia API connection
- `SearchBox` — Search input with autocomplete
- `SearchResults` — Hit rendering
- `Filters` — Facet filters (persona, classification)
- `Configuration` — instantsearch.js config
- `SearchIndex` — Index selection
- `MissingPagesSearch` — Fallback search
- `LearnPortalHits` — Learn portal-specific results
- `Tag` / `Widget` — Base component abstractions

Built on `instantsearch.js` with URL routing that syncs query/page state. Dev model stored in `localStorage` and applied as Algolia refinement filter.

### Learn Portal JS (`js/learnPortal/`)

- Progress tracking with localStorage
- Entity state management (modules, paths)
- Module metadata display

### Third-Party Libraries

| Library | Integration | Location |
|---------|-------------|----------|
| **jQuery** | Global `$()` | Vendored `jquery.min.js`, `jquery.scrollTo.min.js` |
| **PrismJS** | npm | Syntax highlighting |
| **instantsearch.js** | npm via `algoliasearch` | Search UI framework |
| **DocsBot** | Dynamic script injection | AI chat widget |
| **clipboard.js** | Vendored | Copy-to-clipboard |
| **snackbar.js** | Local | Toast notifications |
| **theme.lightbox.js** | Local | Image lightbox |

## CSS/Styling Architecture

### Dual System: Less (legacy) + Tailwind v4 (new)

Both CSS outputs load in parallel. New components go in Tailwind; legacy layout stays in Less until migrated.

### Less (3,496 lines)

Location: `src/_assets/less/`

```
theme.main.less              ← master import
  ├── fonts, variables, reset, typography, icons
  ├── design tokens (tokens/ — decision tokens + quarks pattern)
  ├── layout (header: 632 lines, sidebar: 308 lines, wrap-container: 283 lines)
  ├── components (page-actions, code, button, admonitions, ...)
  └── helpers
theme.search.less            ← Algolia search page (309 lines)
theme.lightbox.less          ← Image lightbox (206 lines)
theme.snackbar.less          ← Toast notifications (100 lines)
```

### Tailwind v4 (189 lines)

Location: `src/_assets/tailwind/`

**No `tailwind.config.js`** — uses Tailwind v4's CSS-first config:

```css
/* main.css — entry point */
@import "tailwindcss/theme.css" source(none);
@import "tailwindcss/utilities.css" source(none);
@source "../../_assets/js/algolia/**/*.js";    /* scan for classes */
@source "../_includes/**/*.liquid";
@source "../_layouts/**/*.liquid";
/* ... more @source directives */
```

Key files:
| File | Content |
|------|---------|
| `main.css` | Entry: imports, `@source` directives for content scanning |
| `colors.css` | Brand palette (grey, violet, orange, neon-green, ultramarine-blue, etc.) |
| `typography.css` | GT Walsheim Pro font, heading styles via `@apply` |
| `sizing.css` | Header/sidebar dimension tokens |
| `breakpoints.css` | Custom `2xl` breakpoint at `90rem` |
| `components/common.css` | Reusable: `kt-button`, `kt-card`, `kt-facet-tag`, `kt-link`, `kt-page-container` |
| `components/prism.css` | PrismJS theme overrides via `@apply` |
| `variants.css` | Custom `aria-current-page` variant |

### Migration Strategy

- New components and pages → Tailwind utility classes
- Existing components → keep in Less until explicitly migrated
- Shared design tokens exist in both systems (colors, sizing)
- When migrating a component: remove the Less rules, add Tailwind classes to templates

## Static Assets

- **Fonts:** 15 files (GT Walsheim family, icon fonts: Atlassian, k15t, kx13, xp), at `src/_assets/fonts/`
- **Images:** Callout icons, favicon, logo, nav arrows, loading gif at `src/_assets/img/`
- **SVGs:** ~500+ icons in `src/_assets/svg/` (`card-media/`, `module/`, `tag/` + loose icons)
- **Docsassets:** Collection-specific screenshots at `src/_docsassets/`

{% endraw %}
