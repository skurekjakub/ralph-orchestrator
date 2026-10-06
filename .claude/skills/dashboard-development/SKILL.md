---
name: dashboard-development
description: "Work on Ralph dashboard code in this repository. Use this skill whenever the user mentions dashboard-local, the Logs tab, timeline analysis, log browser UI, the local Vite dashboard, ralph-dashboard, the Next.js status dashboard, heartbeat/status APIs, Upstash Redis dashboard state, Vercel dashboard deployment, or asks which dashboard surface a change belongs to. This skill is especially important when a request could target either the local log-analysis dashboard or the deployed Next.js status dashboard."
---

# Dashboard Development

This repository has two different dashboard surfaces with different responsibilities. Pick the correct one before editing anything.

## Dashboard map

### `dashboard-local/` — Vite local dashboard

Use this when the request is about:

- the `Logs` tab
- log browsing
- tool timelines
- subagent timelines
- post-run analysis from `output/logs/`
- the local-only debugging UI

Key facts:

- React + Vite app
- Reads historical logs directly from `output/logs/`
- Local API is implemented in `src/logApiPlugin.ts`
- Main log browser entrypoint is `src/components/LogBrowser.tsx`
- Timeline UI lives under `src/components/log-browser/`
- Local conventions are in `dashboard-local/AGENTS.md`; read it before editing
- `npm run dashboard` from the repo root starts the Vite dev server (port 3101)

Typical commands:

```bash
cd dashboard-local
npm install
npm run dev
npm test
npm run lint
npm run build
```

### `ralph-dashboard/` — Next.js status dashboard

Use this when the request is about:

- agent status cards
- `/api/heartbeat`
- `/api/status`
- Upstash Redis
- Vercel deployment
- the public read-only monitoring dashboard

Key facts:

- Next.js App Router app
- Thin web layer over Redis-backed orchestrator heartbeats
- Main page is `app/page.tsx`
- API routes live under `app/api/`

Typical commands:

```bash
cd ralph-dashboard
npm install
npm run dev
npm run lint
npm run build
```

## Routing rule

Decide the target surface before proposing changes.

- If the user mentions `Logs`, `Timeline`, `tool calls`, `subagents`, or browsing saved execution artifacts, work in `dashboard-local/`.
- If the user mentions `heartbeat`, `status`, `agents`, `Redis`, `Vercel`, or a public monitoring page, work in `ralph-dashboard/`.
- If the request says only `dashboard`, inspect the surrounding context and explicitly disambiguate it for yourself before editing.

## Local dashboard workflow

1. Read the relevant log-browser components and parser modules under `dashboard-local/src/components/log-browser/`.
2. Inspect `dashboard-local/src/logApiPlugin.ts` if the issue involves which log files are exposed.
3. Prefer behavior-focused UI tests for log browser features.
4. When adding dependencies, use `npm install` from `dashboard-local/` instead of guessing versions.
5. Verify with:

```bash
cd dashboard-local
npm test && npm run lint && npm run build
```

## Next.js dashboard workflow

1. Read `ralph-dashboard/app/page.tsx` and the relevant API route under `ralph-dashboard/app/api/`.
2. Preserve the current thin-dashboard architecture: UI reads from `/api/status`, writes go through `/api/heartbeat`.
3. Keep environment assumptions aligned with `ralph-dashboard/README.md`.
4. Verify with:

```bash
cd ralph-dashboard
npm run lint && npm run build
```

## Common pitfalls

- Do not confuse the local Vite dashboard with the Next.js dashboard. They solve different problems.
- `dashboard-local` can work without the orchestrator WebSocket when using the `Logs` tab; the live view cannot.
- `dashboard-local` dev server may move off port `3101` if that port is already occupied.
- A log timeline bug is often a parser bug, not a rendering bug. Check the parser modules before redesigning the UI.
