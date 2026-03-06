---
name: devralph-gulp-pipeline
description: "Build pipeline reference for the Gulp 5 orchestration layer in gulp-utils/. Covers task architecture, the asset pipeline (Less + Tailwind CSS + Webpack JS bundling), Jekyll CLI integration, BrowserSync dev server, config overlay system (~15 YAML files), incremental build caching, and all available gulp tasks. Use this skill whenever you modify or create gulp tasks, change asset processing or bundling, debug build failures related to task ordering or config merging, work with BrowserSync live reload, or need to understand how build stages connect — the pipeline has non-obvious dependencies between tasks that this skill maps."
---
{% raw %}

# Gulp Build Pipeline

The docs site uses **Gulp 5** to orchestrate all build steps. Infrastructure lives in `gulp-utils/`.

## Directory Structure

```
gulpfile.js                          ← Re-exports all tasks from gulp-utils/tasks/
gulp-utils/
  tasks/                             ← Exported task compositions
    build.js                         ← CI/CD build variants
    serve.js                         ← Local dev server
    algolia.js                       ← Algolia index update tasks
    validation.js                    ← External URL + Markdown validation
    tests.js                         ← RSpec test runner
    watch.js                         ← Dependency generation alias
    release.js                       ← Changelog release generation
    api-examples.js                  ← .NET API example generation
  gulp-assets.js                     ← CSS/JS/image/font pipeline
  gulp-jekyll.js                     ← Jekyll build orchestration
  gulp-jekyll-configs.js             ← Config merging + theme file generation
  gulp-browsersync.js                ← BrowserSync dev server
  gulp-algolia.js                    ← Algolia indexing wrapper
  gulp-tests.js                     ← RSpec execution
  gulp-validation.js                ← Validation runners
  builders/
    jsConfigBuilder.js               ← Generates theme.config.generated.js from YAML
    nginxConfigBuilder.js             ← Generates nginx.conf from YAML
  caching/
    treeComparer.js                  ← Page tree cache (triggers full rebuild on structure changes)
    moduleComparer.js                ← Learn Portal module cache
    changelogComparer.js             ← Changelog source cache
  paths.js                           ← Central path constants (100+ paths)
  spawner.js                         ← Cross-platform child_process wrapper
  utils.js                           ← Shared utilities
```

## Key Gulp Tasks

| Task | Command | Purpose |
|------|---------|---------|
| `run_serve` | `npm run serve` | Local dev: deps → assets → incremental Jekyll → BrowserSync |
| `run_build` | `npm run build` | Local build (no server) |
| `build_jekyll_full` | CI only | Production: deps → hashed assets → Jekyll |
| `build_jekyll_prv` | CI only | PR validation: infra → deps → validation → build |
| `rspec_tests` | `npx gulp rspec_tests` | Run all Ruby gem RSpec tests |
| `update_algolia_*` | CI only | Push search indexes to Algolia |
| `validate_external_urls` | CI only | Validate all external URLs |
| `validate_markdown` | CI only | Validate markdown content |

## Asset Pipeline

### CSS (Dual System)

```
Less (*.less) → gulp-less → [hash] → src/build/css/theme.main.css
Tailwind (tailwind/) → @tailwindcss/postcss → [hash] → src/build/css/tailwind.css
```

Both outputs load in parallel on the page. New components use Tailwind; legacy layout is in Less.

### JavaScript (Webpack)

4 bundles via Webpack + Babel + Terser:

| Bundle | Entry | Purpose |
|--------|-------|---------|
| `kenticoTheme.min.js` | `js/modules/index.js` | Core UI: header, sidebar, TOC, prism, version switcher |
| `kenticoAlgolia.min.js` | `js/algolia/index.js` | Search: instantsearch.js integration |
| `kenticoDocsbot.min.js` | `js/docsbot/index.js` | AI chat widget |
| `learnPortal.min.js` | `js/learnPortal/index.js` | Tutorial progress tracking |

Bundles are exposed as global `var` libraries. Vendor scripts (jQuery, clipboard.js) are copied as-is.

Hashing enabled for CI (`build_hashed_assets`), disabled for local dev (`build_assets`).

### Static Assets

Fonts, images, SVGs copied to `src/build/`. Docsassets filtered to only enabled documentation.

## Jekyll Integration

Gulp interacts with Jekyll via **Ruby CLI commands** through `spawner.js`:

1. **Config merging** — `jekyll merge_configs` combines primary + environment-specific YAML overlays
2. **Dependency generation** — `jekyll generate_dependencies` creates pagetrees, 404/search pages
3. **Build** — `jekyll build --source src/ --destination src/_site/` (with optional `--incremental`)
4. **Validation** — `jekyll validate` in INFRASTRUCTURE, MARKDOWN, or E_URLS modes

### Config Overlay System

~15 YAML config files in `src/_configs/` compose builds for different contexts:
- `_config_primary.yml` — base config
- `_config_development.yml` — local dev overrides
- Infrastructure configs — for PRV, E2E, AIRA, old versions, test collections
- Final merged output: `src/_jekyllConfigFinal.yml`

## BrowserSync Dev Server

`gulp-browsersync.js` serves from `src/_site/` with:
- URL rewriting middleware (trailing-slash → `.html`)
- Custom 404 handling per Jekyll collection
- File watchers for docs markdown, JS, Less/Tailwind CSS, Liquid templates
- Each file type triggers its own rebuild chain → `browsersync_reload`

## Incremental Build Caching

Three hash-based comparers in `caching/`:
- **treeComparer** — page tree structure → full rebuild on page add/remove/rename
- **moduleComparer** — Learn Portal modules → full rebuild on module changes
- **changelogComparer** — changelog sources → skip `jekyll changelog` if unchanged

Caches stored in `src/.buildcache/`.

## Build Verification Commands

```bash
# Full site build (the primary verification command)
npm run build

# Local dev server with live reload
npm run serve

# Run Ruby gem tests
npx gulp rspec_tests

# Generate API examples
npm run generate_apiexamples
```

## Modifying the Pipeline

- New gulp tasks go in `gulp-utils/tasks/` and re-export from `gulpfile.js`
- Asset processing steps go in `gulp-assets.js`
- Path constants go in `gulp-utils/paths.js`
- All subprocess execution uses `spawner.js` (cross-platform wrapper)

{% endraw %}
