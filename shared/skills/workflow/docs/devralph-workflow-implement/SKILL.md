---
name: devralph-workflow-implement
description: "Phase 3 of the standard development workflow — execute your implementation plan from Phase 2. Make code changes and build after every edit. References domain skills (devralph-ruby-gems, devralph-frontend, etc.) for stack-specific patterns. Building after every change catches errors early because the Liquid→Pandoc→HTML pipeline surfaces errors only at build time."
---
{% raw %}

# Phase 3: Implement

## Before you begin

1. **Read `state.md`** — confirm you're in Phase 3. Read your Implementation Plan.
2. Read domain skills for the affected components (listed in `state.md`).

## Instructions

1. **Work through your Implementation Plan** step by step. Use the todo tool to track progress.

2. **After every file change, run the appropriate build command** — the Liquid→Pandoc→HTML pipeline only surfaces errors at build time. A tag that looks syntactically correct may fail when Pandoc processes its output, or when Jekyll validates cross-references. Catching these immediately keeps the feedback loop tight:
   - Ruby gem changes → `cd gems/<gem> && bundle exec rspec` (fast, gem-specific)
   - Any site change → `npm run build` (full build with validation)
   - Code sample changes → `npm run codesamples:build`
   - See **devralph-build-verification** skill for the full checklist

3. **Follow stack-specific patterns** — the domain skills (devralph-ruby-gems, devralph-frontend, etc.) have the full architecture details. Here's a quick reference for the most common conventions:

   **Ruby gem development:**
   - Inherit from the correct base class (`KenticoTagBase`, `KenticoBlockTagBase`, `KenticoLinkTagBase`)
   - Define `SUPPORTED_PARAMS` for tag parameter validation
   - Use the DI container (`Core::ServiceContainer`) for service registration
   - Register tags with `Liquid::Template.register_tag('name', ClassName)`

   **Frontend JS:**
   - Use ES module `import`/`export` syntax
   - New modules must be imported from the correct bundle entry point
   - jQuery is available globally via `$()` — use it for DOM manipulation
   - Test in BrowserSync (`npm run serve`) for interactive verification

   **CSS changes:**
   - New components → Tailwind utility classes in templates
   - If adding Tailwind classes in a new file location, add a `@source` directive in `tailwind/main.css`
   - Modifying existing Less → edit in `src/_assets/less/`
   - Migrating Less → Tailwind: remove Less rules, add Tailwind classes to templates

   **Jekyll templates:**
   - Layouts go in `src/_layouts/`
   - Includes go in `src/_includes/components/<category>/`
   - Use `{% include %}` for partials
   - Use collection variables via `site.data.pagetree[collection]` for navigation

   **Gulp pipeline:**
   - New tasks go in `gulp-utils/tasks/` and re-export from `gulpfile.js`
   - Asset processing in `gulp-assets.js`
   - Use `spawner.js` for subprocess execution

4. **Fix build failures immediately** — don't proceed to the next step with a broken build. Read **devralph-build-verification** for common error patterns.

5. **Update `state.md`** — check off completed implementation steps, note any deviations from the plan.

## Before moving to Phase 4

Update `state.md`:
- Set "Current Phase" to `Phase 4: Test`
- Set "Skills for this phase" to:
  - devralph-workflow-test
- Add Phase 3 to "Completed Phases" with summary of changes made
- List all files modified/created
- Confirm the build passes: `npm run build`

{% endraw %}
