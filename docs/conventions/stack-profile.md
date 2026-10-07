# Stack profile — ralph-orchestrator

> **Adapt me.** Every `rubber-duk-*` agent reads this file before it reviews or
> writes code. It holds everything that depends on _this_ stack
> (Node.js 24 / TypeScript ESM / awilix DI / Docker Compose / Vitest (+ React/Vite & Next.js dashboards)): the framework docs to trust over training data, the
> skills to load, and the stack-specific hunt lists. The agents' own prompts
> stay stack-neutral — when the stack changes, change this file, not the
> agents. Delete sections that don't apply; add the rules your team keeps
> repeating in review.

## Framework docs and skills

- **Framework docs.** Cite these over training data. No installed package in
  this checkout ships bundled docs, so use the upstream docs for the installed
  major:
  - Repo docs first (and the code over any doc): `AGENTS.md`,
    `docs/user-guide/` (operator reference: configuration, env vars, profiles,
    template variables, trigger parameters, runtime macros, MCP servers,
    skills), `docs/dev-doc/` (DI, compose layering, multistage pipelines, MCP
    sidecar design, data-source registration, egress security,
    prompt-injection hardening), `MCP.md`, `SECURITY.md`.
  - Orchestrator (`src/`): Node.js 24 API (`engines` ≥ 24, CI runs 24.x),
    TypeScript 6.0 as a type-checker only (`moduleResolution: "bundler"`,
    `isolatedModules`), esbuild bundling `src/index.tsx` into
    `dist/index.js`, awilix 13 (`InjectionMode.PROXY`,
    `strict`), execa 10, zod 4 (not the v3 API), liquidjs 10, ws 8, ink 8 +
    React 19.3 (`src/cli-dashboard/`), Docker Compose multi-file merge rules,
    Squid ACL syntax (`shared/security/squid.conf`).
  - Copilot CLI (the only runtime CLI today):
    `docs/research/copilot-cli-internals.md`.
  - MCP: SDK v2 — `@modelcontextprotocol/server` + `@modelcontextprotocol/node`
    in `shared/mcp-servers/*`, `@modelcontextprotocol/client` +
    `@modelcontextprotocol/core` (plus `server` and `node` for the stdio
    bridge) in `shared/mcp-sidecar`; `@playwright/mcp` 0.0.83
    (`shared/mcp-sidecar/Dockerfile`).
  - Sub-projects `shared/mcp-servers/*`, `shared/mcp-sidecar`,
    `ralphchives/sync`: TypeScript 7.0 as a type-checker only
    (`moduleResolution: "bundler"`, `isolatedModules`, `noEmit`), esbuild
    bundles, extensionless relative imports. Custom MCP servers launch
    through `shared/mcp-servers/common/http-launch.ts`
    (`--transport http --port <port> --host <address>`).
  - `dashboard-local/`: React 19.3, Vite 8, TypeScript 7.0, Tailwind CSS 4
    (CSS-first `@theme`), `@xyflow/react` 12, `d3-sankey` 0.12, Testing
    Library (React 16), jsdom.
  - `ralph-dashboard/`: Next.js 16 App Router, React 19.3, TypeScript 7.0,
    `@upstash/redis`, Tailwind CSS 4.
  - Tests in every package: Vitest 5.
- **Skills to load** (`.claude/skills/`; the path-scoped `.claude/rules/` load
  themselves):
  - `tests/**`: `test-patterns`, plus `vitest` for runner API questions.
  - `profiles/**`, `shared/agent-includes/**`, `shared/skills/**`:
    `ralph-agent-authoring`.
  - `shared/mcp-servers/**`, `shared/mcp-sidecar/**`, `mcpServers` / `env` /
    `sidecarEnv` wiring in `profile.json`: `mcp-deployment`; new server code:
    `mcp-builder`.
  - `ralphchives/**`, `ralphchives-read` / `ralphchives-write`:
    `nodebb-interaction`.
  - `dashboard-local/**`, `ralph-dashboard/**`: `dashboard-development` first
    (it decides which dashboard owns the change), then
    `vercel-react-best-practices` and `vercel-composition-patterns` for
    React/Next.js code and `web-design-guidelines` for UI review.
  - Failed runs and `output/logs/` forensics: `task-failure-diagnosis`,
    `cli-debug-log-analysis`.
  - Never rename `agent-eval`, `cli-debug-log-analysis`, `skill-creator` or
    `mcp-builder`: the host-side `ralph.scientist` hook loads them by name.

## Review hunt list (rubber-duk-review, rubber-duk-backend)

- **Anti-patterns**, forbidden → do instead:
  - `export … from` re-export, or a compat wrapper/shim after a move → import
    from the defining module and update every call site.
  - Relative import with an extension (`./foo.js`, `./foo.ts`) → `./foo`
    (esbuild resolves it; `.json` imports keep their extension).
  - A consumer importing or `new`-ing a concrete service class → depend on its
    `I`-interface; register the class in `createCradle()`
    (`src/awilix-cradle.ts`) and add the token to `OrchestratorCradle`
    (`src/awilix-cradle-types.ts`). Per-task objects belong in
    `buildContainerFactory`.
  - Constructor taking `IAppConfig` or positional deps → one destructured deps
    object of cradle tokens and config slices.
  - String-literal union for a fixed set → TS `enum`, with `z.enum` validating
    the raw JSON.
  - A config key added only to `types.ts` → `src/config/schemas.ts` (zod) +
    `types.ts` + `loader.ts` + `config.json.sample` + `docs/user-guide/`.
  - Commented-out code or an ad hoc env check toggling behaviour → a real
    config flag.
  - `child_process` or shell strings → `execa` v10 with an argument array.
  - A JIRA/ADO SDK, axios, or `fetch` from a consumer → native `fetch` inside
    the service client (`JiraClient`, `VcsSourceClient`), retried with
    `withRetry` (`src/retry.ts`), never a hand-rolled retry loop.
  - `console.*` or a silent `catch` in file I/O, subprocess, network or
    orchestration code → the injected `Logger` (`consoleLogger` is for tests
    and scripts only).
  - Local-time strings in the ledger, logs or summaries → `toISOString()`.
  - JIRA text (description, comments, attachments, trigger params) reaching a
    prompt, path, shell argument, branch name or compose value unchecked →
    `PromptBuilder` for prompt text; explicit validation for everything else
    (pattern: `assertSafeItemId` in `src/services/operation-ledger.ts`).
  - A credential in the agent container env, a profile compose file or any
    committed file → `.env` + the sidecar's `gateway.json` (MCP `env`,
    `$variantEnv.*`).
  - Editing `profiles/*/.build/` or `shared/skills/.build/` → edit the source
    template; `.build/` is regenerated every task.
  - A Liquid variable not declared on `TemplateContext`
    (`src/container/setup/agent-includes.ts`) → declare it and add it to the
    key set in `tests/container/template-context-lint.test.ts`. Literal Liquid
    delimiters in a template → wrap them in `{% raw %}`.
  - `any` in `src/` → a real type (ESLint error there; allowed in `tests/`).

## Security surface (rubber-duk-auditor)

- **Canonical config:** no CSP and no custom response-header, CORS or cookie
  config exists anywhere in this repo — report its absence; don't invent a
  contract. What exists:
  - `ralph-dashboard/next.config.ts` is an empty `NextConfig` (no
    `headers()`); there is no `middleware.ts` and no `vercel.json`, so
    responses carry Next.js/Vercel defaults only. No cookies are set.
    `app/api/heartbeat/route.ts` checks `Authorization: Bearer
<DASHBOARD_SECRET>`; `app/api/status/route.ts` is unauthenticated.
  - `dashboard-local/vite.config.ts`: Vite dev server on :3101 (default
    `localhost` bind), no header/CSP/CORS options; its `/api/*` middleware
    plugins (`dashboard-local/src/*Plugin.ts`) read the parent repo from disk.
  - `src/services/dashboard-server.ts`: `new WebSocketServer({ port: 3100 })`
    with no host, origin check or auth, so it listens on all interfaces and
    pushes orchestrator state and tool output to any client.
  - The real security contract is container egress:
    `shared/security/docker-compose.security.yml` (internal network, Squid
    sidecar, `cap_drop: ALL`, limits), `shared/security/squid.conf` (baseline
    allowlist, extended by profile `allowlistDomains` through
    `src/container/setup/squid-config.ts`),
    `src/container/setup/url-restrictions.ts` (Copilot CLI URL allowlist
    derived from that squid.conf) and `src/container/setup/compose-overlay.ts`
    (`BASE_CONTAINER_ENV`, the only env vars the agent container gets). Read
    them with `SECURITY.md` and `docs/dev-doc/egress-security.md`.
- **Trust boundaries** — what must never cross:
  - JIRA → prompt and container: issue text, comments, attachments and trigger
    params are attacker-writable. They reach the agent only through
    `PromptBuilder` (`src/prompt/`: normalizer + `prompt-auditor.ts`,
    `promptAudit.mode`). `$trigger.<key>` values and trigger params are
    validated before they become a path, shell argument, branch or compose
    value. `connection.allowedUsers` limits who can trigger.
  - Agent container ↔ MCP sidecar: the agent gets the URL-only
    `.build/mcp-config.json` and `BASE_CONTAINER_ENV`; MCP secrets live only
    in the sidecar's `.build/gateway.json`. Never mount `gateway.json` or
    server code into the agent, or put a secret in
    `profiles/<id>/docker-compose.yml`.
  - Agent container → internet: only through Squid on `ralph-internal`. Every
    domain added to `squid.conf` or `allowlistDomains` widens the exfiltration
    surface and needs a reason. The sidecar has direct egress
    (`ralph-sidecar-external`), so an MCP tool that returns fetched content is
    an injection path into the agent.
  - Host: `mode: "local"` stages and post-task hooks run `copilot` on the
    host with cwd = this repo root, outside the container sandbox.
  - Orchestrator → ralph-dashboard: `DASHBOARD_SECRET` leaves the orchestrator
    only as the bearer header in `src/services/heartbeat.ts`. It never appears
    in a response, a client component or a `NEXT_PUBLIC_*` var. `GET
/api/status` is public, so every heartbeat field (current task key,
    profile id, last completed task) is public.
  - ralph-dashboard client/server: `app/page.tsx` is a `"use client"`
    component that only calls `fetch("/api/status")`. `@upstash/redis`
    (`Redis.fromEnv()`, `UPSTASH_REDIS_REST_*`) and `DASHBOARD_SECRET` stay in
    `app/api/**/route.ts`; never import them into a client component.
  - dashboard-local: browser code reaches data only through the Vite plugin
    `/api/*` routes and `ws://localhost:3100`. A new route that takes a
    filename keeps the traversal guard in `dashboard-local/src/logApiPlugin.ts`.

## Backend surface (rubber-duk-backend)

- **Owned paths.** Everything rendering UI goes to rubber-duk-frontend.
  - `src/**` except `src/cli-dashboard/`: entry, config, DI cradle,
    orchestrator loop, `services/`, `container/` (+ `setup/`,
    `cli-executors/`), `datasource/`, `prompt/`, `logs/`, `validate/`,
    `util/`.
  - `tests/**` (root Vitest suite) and `scripts/**` (tsx scripts, neither
    type-checked nor linted).
  - `profiles/<id>/` infrastructure: `profile.json`, `Dockerfile`,
    `docker-compose.yml`, `setup.sh`. Templates and runtime skills
    (`profiles/*/agents/`, `shared/agent-includes/`, `shared/skills/`) are
    runtime prompt content: follow `.claude/rules/runtime-agents.md`.
  - `shared/security/`, `shared/hooks/`, `shared/mcp-sidecar/`,
    `shared/mcp-servers/`, `ralphchives/`.
  - Dashboard server code: `dashboard-local/src/*Plugin.ts`,
    `dashboard-local/vite.config.ts`, `ralph-dashboard/app/api/**/route.ts`,
    `ralph-dashboard/next.config.ts`.
  - Root config: `package.json`, `tsconfig.json`, `tests/tsconfig.json`,
    `eslint.config.js`, `vitest.config.ts`, `config.json.sample`,
    `.env.example`, `.github/workflows/`.

## Frontend (rubber-duk-frontend)

- **UI surfaces:** `dashboard-local/src/**/*.tsx`, its `use*.ts` hooks and
  `src/styles.css`; `ralph-dashboard/app/page.tsx`, `layout.tsx`,
  `globals.css`; the Ink TUI in `src/cli-dashboard/*.tsx` (terminal `Box` /
  `Text`, no DOM or CSS).
- **dashboard-local** (read `dashboard-local/AGENTS.md` first):
  - Tokens are the Tailwind v4 `@theme` block in
    `dashboard-local/src/styles.css`: `bg`, `bg-panel`, `bg-header`,
    `border`, `text`, `dim`, `info`, `success`, `warn`, `error`, `font-mono`
    (`bg-bg-panel`, `text-dim`, `border-border`, `text-success`…). One dark
    theme; no `dark:` variants.
  - A class naming an undeclared token compiles to nothing, silently:
    `bg-surface-raised` on the log-browser tooltips has no
    `--color-surface-raised`, so those tooltips render transparent. Add the
    token to `@theme` before using it.
  - Colours that can't be classes (SVG fills, xyflow edges, category colours)
    are named constants in a co-located `*-shared.ts` (`COLOR_*` in
    `context-window-chart-shared.ts`, `CAT_HEX` in `tool-timeline-shared.ts`),
    never repeated inline. Inline `style` only for dynamic values.
  - Log-browser charts are raw SVG; graphs use `@xyflow/react`; the token
    Sankey uses `d3-sankey`. No new charting dependency without asking.
  - One component per file; split past ~150 lines behind an orchestrator
    parent. Types in `tool-timeline-types.ts`, parsers in `*-parser.ts`, data
    hooks in `use*.ts`, `formatTokens()` / `formatMs()` for display.
  - Interactive elements are `<button type="button">` (the ▾/▸ toggles in
    `ContextWindowChart.tsx`), never a clickable `<div>` (the rows in
    `ToolTimelineCallList.tsx` are the counter-example). Icon-only buttons
    need an accessible name.
  - Verify inside `dashboard-local/`: `npm run lint`, `npm test`,
    `npm run build`. The root `npm test` doesn't cover dashboard-local.
- **ralph-dashboard:** App Router, Tailwind v4 default palette (`gray-950`…)
  with `className="dark"` on `<html>`. No tests; verify with `npm run lint`
  and `npm run build` in `ralph-dashboard/`. `npm run deploy` pushes to
  Vercel production — only when the user asks.

## Unit tests (rubber-duk-tests)

- Runner: Vitest. Load the `vitest` skill for `test.extend`, `test.for`,
  `vi.mocked` / `vi.hoisted`, mocking and reset semantics. **Version caveat:**
  the skill may target an older major than `package.json` declares — verify
  mocking, fixture and config claims against the official docs for the
  installed major.
- Environments: the root suite runs in `node`. `dashboard-local/vitest.config.ts`
  sets `environment: "jsdom"` and `setupFiles: "./src/test/setup.ts"`
  (Testing Library `cleanup()` + `vi.restoreAllMocks()` after each test) for
  the whole package, so no per-file docblock is needed there.
- Read `vitest.config.*` for the mechanics the suite relies on (globals,
  `restoreMocks` / `clearMocks`, setup files, aliases). Root
  `vitest.config.ts` sets only `include: ["tests/**/*.test.ts"]` and excludes
  the sub-projects: no globals (import `describe` / `it` / `vi` from
  `vitest`), no automatic mock reset, no setup file.
- Root conventions (`.claude/rules/testing.md`, `test-patterns` skill):
  `Mocked<IFoo>` mocks from `tests/helpers/mocks.ts` against the interface,
  pure `make*` builders from `tests/helpers/factories.ts`, top-level
  `vi.mock` for ESM modules (`vi.spyOn` can't intercept namespace exports),
  `{ delayMs: 1 }` retry options instead of raised timeouts.
