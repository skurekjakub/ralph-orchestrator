---
name: devralph-ruby-gems
description: "Architecture reference for the 8 custom Ruby gems under gems/. Covers kentico-core (DI container, tag base classes, validation), liquid-kfm (42 custom Liquid tags), jekyll-algolia (search indexing), jekyll-learn-portal (learning modules/paths), and supporting gems. Use this skill whenever you touch Ruby code under gems/, encounter Liquid tag rendering errors, need to add or modify a tag, debug DI container registration, fix Learn Portal module/path behavior, or work with Algolia search indexing — even for seemingly simple tag changes, because the tag system has subtle coupling through the DI container and shared base classes that this skill maps."
---
{% raw %}

# Ruby Gems Architecture

The docs site uses 8 custom gems under `gems/`. All gems use `kentico-core` as a foundation.

## Gem Overview

| Gem | Purpose | Key integration |
|-----|---------|-----------------|
| **kentico-core** | Shared base: tag base classes, DI container, validation, logging | Foundation for all other gems |
| **liquid-kfm** | 42 custom Liquid tags (links, admonitions, tables, grids, code, assets) | Liquid rendering phase |
| **jekyll-algolia** | Algolia search indexing (forked/customized) | `jekyll algolia` CLI command |
| **jekyll-learn-portal** | Learning paths + modules system | `:site, :post_read` hook |
| **jekyll-kentico-customizations** | Pandoc converter, URL generation, validators, generators | Multiple Jekyll hooks |
| **jekyll-redirect-from** | URL redirect support | Redirect pages |
| **jekyll-sitemap** | Sitemap generation | `:site, :post_write` |
| **jekyll-changelog** | Changelog/release notes | `jekyll changelog` CLI |

## kentico-core (Foundation)

**Location:** `gems/kentico-core/`

### DI System

Uses `dry-container` + `dry-auto_inject`:

```ruby
# Register a service
Core::ServiceContainer.register_implementation(InterfaceName, ClassName, singleton: true)

# Resolve in a class
class MyService
  include Core::ServiceResolver[:url_resolver, :validator]
end
```

### Tag Base Classes

All custom Liquid tags inherit from these:

- `KenticoTagBase` → extends `Liquid::Tag` (inline tags like `{% image %}`)
- `KenticoBlockTagBase` → extends `Liquid::Block` (block tags like `{% code %}...{% endcode %}`)
- `KenticoLinkTagBase` → extends `KenticoTagBase` (link tags like `{% page_link %}`)

**Key shared module:** `KenticoSharedBaseLogic` provides:
- Parameter parsing via `Liquid::Tag::Parser` (`@params[:key]`, `@params[:argv1]`)
- `SUPPORTED_PARAMS` constant for validation
- Collection/context helpers

### Creating a New Liquid Tag

1. Create class in `gems/liquid-kfm/lib/` under appropriate subdirectory
2. Inherit from the right base class
3. Define `SUPPORTED_PARAMS` constant
4. Implement `render(context)` (inline) or `render_block(context, content)` (block)
5. Register with `Liquid::Template.register_tag('tag_name', ClassName)`
6. The tag auto-loads because `liquid-kfm.rb` requires all `.rb` files under `lib/`

### Parameter Handling Pattern

```ruby
class MyTag < KenticoTagBase
  SUPPORTED_PARAMS = %i[param1 param2 optional_flag].freeze

  def render(context)
    required_value = @params[:argv1]  # first unnamed param
    optional = @params[:param1]
    # ... render HTML
  end
end
```

## liquid-kfm (Custom Tags)

**Location:** `gems/liquid-kfm/`

### Tag Categories

**Admonitions** (block tags): `key`, `info`, `warning`, `note`, `tip` — callout boxes with optional icons

**Links** (inline tags): `page_link`, `external_link`, `anchor`, `inpage_link`, `button_link`, `toc`, `page_tree`

**Assets** (inline tags): `image`, `video`, `file`, `arcade`

**Code** (block tags): `code` (inline code block), `code_link` (code from external file with section extraction)

**Layout** (block tags): `columns`/`column`, `grid`/`grid_item`, `table`/`row`/`cell`

**Inline**: `icon`, `status`

**Theme/Layout**: `table_of_contents`, `related_pages`, `classification_label`, `license_info`, `filename_hash`

### Critical patterns

- **Page identifier resolution:** Tags use `UrlFromIdResolver` to look up pages by frontmatter `identifier` field across collections
- **Pandoc rendering:** Block tag content goes through Pandoc for markdown→HTML conversion
- **Error on unknown params:** `KenticoValidatorMain` validates no unsupported params are passed

## jekyll-algolia (Search)

**Location:** `gems/jekyll-algolia/`

### How Indexing Works

1. `jekyll algolia` CLI command triggers indexing
2. `Jekyll::Algolia::Site` subclass overrides `process()` — extracts records instead of writing files
3. Pipeline: `reset → read → generate → keep_only_indexable_files → render → push`
4. Records extracted from HTML using `AlgoliaHTMLExtractor` (configurable CSS selector, default `p`)
5. Diff-based updates minimize API calls

### Configuration

```yaml
# _config.yml
algolia:
  application_id: <ALGOLIA_APPLICATION_ID env var>
  api_key: <ALGOLIA_API_KEY env var or _algolia_api_key file>
  index_name: <ALGOLIA_INDEX_NAME env var>
  nodes_to_index: 'p'
  settings:
    searchableAttributes: [...]
    attributesForFaceting: [...]
```

### Hook System

```ruby
# Register a decorator for search records
AlgoliaHooks.register_decorator(:before_each, MyDecorator)
AlgoliaHooks.register_decorator(:before_all, MyBatchDecorator)
```

Decorators implement `decorate(record)` (before_each) or `decorate(records)` (before_all).

### Facet Converters

`persona_facet_converter.rb` and `classification_facet_converter.rb` map internal codenames to display names for search facets.

## jekyll-learn-portal (Learning Portal)

**Location:** `gems/jekyll-learn-portal/`

### Orchestration Flow

```
Jekyll :site :post_read hook
  → LearnPortalOrchestrator.orchestrate(site)
    → ModuleManager → discovers _modules/ dirs → loads configs → creates ModuleDocuments
    → PathManager → discovers _paths/ dirs → loads configs → binds modules → creates PathDocuments
    → Decorators fire hook events (6 hook points)
```

### Data Model

**Module config** (`_modules/<slug>/<slug>.yml`):
```yaml
module_title: "Developer Essentials"
persona: "developer"
sequence:
  - page:
      collection: xperience
      identifier: ABCDE      # reference page from another collection
    subpages: true/false
  - page:
      filename: local-page.md # module-specific page
```

**Path config** (`_paths/<slug>/<slug>.yml`):
```yaml
path_title: "Getting Started Path"
persona: "developer"
landing_page: { filename: landing.md }
sequence:
  - module: { identifier: developer-essentials }
```

### Custom Documents

- `ModuleDocument` extends `Jekyll::Document` — URL: `/<collection>/modules/<slug>/<page_slug>`
- `PathDocument` extends `Jekyll::Document` — URL: `/<collection>/paths/<slug>`
- `ModuleSubpage` — split from ModuleDocument at H2 headings when `subpages: true`

### Decorator Hook Points

`LearnPortalDecorator` fires at: `decorate_module_postload`, `decorate_module_prerender`, `decorate_document_postload`, `decorate_document_prerender`, `decorate_path`, `decorate_site`

### Portal Liquid Tags (9)

`module_link`, `path_link`, `module_sequence`, `module_navigation`, `module_content_wrapper`, `portal_module_elements`, `portal_path_elements`, `portal_meta_elements_search`, `canonical_url`

## Testing Ruby Gems

```bash
# Run all gem tests
npx gulp rspec_tests

# Run tests for a specific gem
cd gems/<gem-name>
bundle exec rspec
```

Tests use RSpec. Each gem has a `spec/` directory.

{% endraw %}
