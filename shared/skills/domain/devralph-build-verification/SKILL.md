---
name: devralph-build-verification
description: "Build verification and error troubleshooting reference. Covers primary build commands (npm run build, npm run serve, npx gulp rspec_tests), common failure patterns across Jekyll/Liquid, Ruby gems, Webpack, Less/Tailwind CSS, and the Gulp pipeline, plus diagnosis strategies for each. Use this skill before committing any changes, when any build step fails, when you see unfamiliar error output, or when you need the verification checklist for your type of change — the build pipeline has 5 sequential stages where errors in one stage often masquerade as problems in another, so understanding the pipeline order matters for diagnosis."
---
{% raw %}

# Build Verification

## Primary Build Commands

Run these to verify your changes work:

| Command | What it checks | When to run |
|---------|---------------|-------------|
| `npm run build` | Full site: config merge → dependencies → assets (Less, Tailwind, Webpack) → Jekyll build + validation | After every change, before committing |
| `npx gulp rspec_tests` | RSpec tests for all Ruby gems (kentico-core, liquid-kfm, learn-portal, etc.) | After modifying any gem in `gems/` |
| `npm run codesamples:build` (or `cd src/_code && dotnet build`) | .NET code sample compilation | After modifying any `.cs` files in `src/_code/` |

## Build Pipeline Order

```
1. Config merge (jekyll merge_configs)
2. Dependency generation (jekyll generate_dependencies → pagetrees, search/404 pages)
3. Assets
   a. Delete old CSS/JS → rebuild Less → rebuild Tailwind → copy to build/
   b. Webpack bundle JS → copy vendor JS → copy to build/
   c. Copy fonts, images, SVGs
4. Jekyll build (--source src/ --destination src/_site/)
   → Liquid rendering (all custom tags run here)
   → Pandoc markdown conversion
   → Validation (infrastructure + markdown checks)
5. Output → src/_site/
```

## Common Build Failures

### Jekyll / Liquid Tag Errors

**Broken page_link identifier**
```
identifier "unknownID" not found
```
Fix: Check for typos in the identifier. If the target page was removed, update or remove the link.

**Missing anchor**
```
anchor "myAnchor" not defined in current page
```
Fix: Add `{% anchor myAnchor %}` at the target location, or fix the typo.

**Unknown tag parameter**
```
Unknown parameter "badParam" for tag "image"
```
Fix: Check the tag's `SUPPORTED_PARAMS` in its Ruby class. Remove the unsupported parameter.

**Duplicate identifier**
```
duplicate identifier "ABCDE" found in collection
```
Fix: Each page's `identifier` frontmatter value must be unique within the collection.

### Ruby Gem Errors

**Gem load failure**
```
cannot load such file -- kentico-core (LoadError)
```
Fix: Run `bundle install` in the project root. If a specific gem fails, check its `gemspec` dependencies.

**RSpec failures**
```
npx gulp rspec_tests → FAILED
```
Fix: Run `cd gems/<gem-name> && bundle exec rspec` to isolate which tests fail. Read the failure output for assertions.

### Webpack / JS Errors

**Bundle failure**
```
ERROR in ./src/_assets/js/modules/newFile.js
Module not found
```
Fix: Check the import path. Webpack resolves from `src/_assets/js/`. Verify the file exists and the import statement is correct.

**Syntax error in bundle**
Fix: Babel transpiles ES modules. Check for syntax incompatible with the project's Babel config.

### CSS Errors

**Less compilation failure**
```
LessError: variable @unknown is undefined
```
Fix: Check `less/tokens/` for design token definitions. Add missing variables or fix references.

**Tailwind class not applied**
Fix: Ensure the file containing the class is in a `@source` directive in `tailwind/main.css`. Tailwind v4 only scans declared sources.

### Config Errors

**Config merge failure**
```
Error merging configs
```
Fix: Check YAML syntax in `src/_configs/` files. Ensure no duplicate keys or invalid YAML.

## Verification Checklist

Before committing any change:

1. **Ruby gem changes** → `cd gems/<gem> && bundle exec rspec`
2. **Liquid tag changes** → `npm run build` (tags execute during Jekyll's Liquid phase)
3. **JS changes** → `npm run build` (Webpack bundles during asset step)
4. **CSS changes (Less)** → `npm run build` (Less compiles during asset step)
5. **CSS changes (Tailwind)** → `npm run build` + verify `@source` directive covers your files
6. **Layout/include changes** → `npm run build` + visual check via `npm run serve`
7. **Frontmatter changes** → `npm run build` (validation catches broken references)
8. **Code sample changes (.cs)** → `npm run codesamples:build` + `npm run build`
9. **Gulp task changes** → Test the specific task, then full `npm run build`

## Dev Server for Visual Verification

```bash
npm run serve
```

Opens BrowserSync at `http://localhost:3000`. File watchers auto-rebuild on:
- Documentation markdown changes → incremental Jekyll rebuild
- JS file changes → Webpack rebundle → reload
- Less/Tailwind CSS changes → recompile CSS → reload
- Liquid template changes → Jekyll rebuild → reload

{% endraw %}
