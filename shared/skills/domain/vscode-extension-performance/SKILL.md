---
name: vscode-extension-performance
description: Use this skill when working on VS Code extension startup cost, activation events, extension host performance, bundling, lazy registration, watch/build scripts, `.vscodeignore`, or when evaluating whether an extension loads too much work too early. Also use when modifying `package.json` activation events, bundler config, extension entry points, or performance-sensitive provider registration.
---

# VS Code Extension Performance

Guidance for keeping VS Code extensions fast to activate, cheap to load, and lightweight to package.

Use this skill for:
- startup and activation-cost reviews
- deciding between eager and lazy registration
- activation event selection in `package.json`
- bundling and package-size work
- extension host performance regressions

## Core Principles

1. **Activate only when needed**
   Prefer specific activation events over broad startup activation.

2. **Do not front-load work into `activate()`**
   Keep activation focused on registration and lightweight initialization.

3. **Bundle for install and load performance**
   Bundling reduces file-count overhead and improves load time, especially for web-compatible extensions.

4. **Type-check separately from bundling when needed**
   Bundlers such as esbuild strip types but do not replace real type checking.

5. **Publish only runtime artifacts**
   Exclude source and dev-only files from the VSIX using `.vscodeignore` or equivalent packaging rules.

## Activation Guidance

- Prefer narrow activation events such as `onLanguage:<id>`, `onCommand:<id>`, `onView:<id>`, or `workspaceContains:<glob>`
- Avoid `*` unless no narrower combination works
- Avoid generic `onLanguage` unless the extension truly needs to activate before any language-specific work
- Treat `onStartupFinished` as lower-risk than `*`, but still justify it explicitly

## Runtime Guidance

- Register providers, commands, and listeners first; defer expensive scanning or indexing
- Avoid large synchronous workspace scans in `activate()`
- Do not do heavyweight parsing for unopened files unless explicitly needed
- Cache derived data only when invalidation is clear and cheap
- Prefer incremental updates over full recomputation when documents change

## Bundling Guidance

- Bundle the extension entry point into a single runtime artifact when possible
- Exclude the `vscode` module from the bundle
- Keep source maps for development builds, not necessarily for production packaging
- If using esbuild, still run `tsc --noEmit` for type safety
- If using webpack, treat critical dependency warnings as real bundle risks, not harmless noise

## Packaging Guidance

- Keep runtime output in `dist/` or another explicit package target
- Exclude `src/`, transient build output, and unnecessary `node_modules` content from published packages
- Ensure `main` points at the bundled runtime artifact when bundling is introduced

## Review Checklist

When reviewing performance-sensitive extension changes, check:
- Did activation events become broader?
- Did `activate()` gain synchronous heavy work?
- Did a new provider or watcher get registered globally when it could be language-scoped?
- Did bundling or packaging configuration regress?
- Did a build change increase package complexity without a clear runtime benefit?
- Is there now duplicated work between activation, document open, and document change handlers?

## Repo Usage

For extension repositories like `ralph-vscode` targets, use this skill when changes touch:
- extension activation and lifecycle entry points
- completion/diagnostic/decoration registration
- build tooling and bundler config
- `package.json` activation events or contribution points
- package/publish workflow changes

## Output Expectations

When using this skill, call out:
- what activates the extension now
- what work happens immediately on activation
- what work was deferred or kept lazy
- whether package-size or file-count changed