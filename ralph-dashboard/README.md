# Ralph Dashboard

Status dashboard for the Ralph AI documentation agent. Displays real-time status cards for all connected orchestrator instances, including current task, queue depth, processing history, and heartbeat health.

Built with **Next.js 15** (App Router), **Tailwind CSS v4**, and **Upstash Redis** (via Vercel Marketplace integration).

## Architecture

The dashboard is a thin stateless web layer between Ralph orchestrator instances and anyone watching:

```
Orchestrator A ─┐
Orchestrator B ─┤── POST /api/heartbeat ──→ Upstash Redis ──→ GET /api/status ──→ Dashboard UI
Orchestrator C ─┘
```

### Multi-agent support

Multiple orchestrator instances can report to the same dashboard simultaneously. Each instance generates a fresh UUID on startup (the "agent ID") and includes it in every heartbeat. The dashboard stores and displays each agent as a separate card.

- **Agent identification**: UUID v4 generated at orchestrator startup via `crypto.randomUUID()`. A fresh ID is created on every restart — the dashboard doesn't track continuity across restarts.
- **Storage**: One KV key per agent (`ralph:agent:{agentId}`), plus a set key (`ralph:agents`) for listing.
- **TTL-based cleanup**: Each agent key has a 24-hour TTL. Agents that stop heartbeating are automatically removed by Redis expiration. The `/api/status` endpoint also prunes expired IDs from the `ralph:agents` set.
- **No shared queue state**: Each agent reports only about itself (its own task, lifetime stats, heartbeat). The JIRA queue is shared at the JIRA level, not in the dashboard.

### Authentication

The dashboard uses a simple **shared-secret bearer token** scheme:

1. Generate a random secret: `openssl rand -hex 32`
2. Set it as `DASHBOARD_SECRET` on both the Vercel deployment and in the orchestrator's `.env` file
3. The orchestrator sends it in every heartbeat request: `Authorization: Bearer <secret>`
4. The `/api/heartbeat` endpoint compares the header value against the server-side env var
5. The `/api/status` GET endpoint is **unauthenticated** (public read-only)

This is intentionally simple — there are no user accounts, sessions, or tokens to manage. The secret just prevents unauthorized writes to the dashboard state.

## Setup

### 1. Install dependencies

```bash
cd ralph-dashboard
npm install
```

### 2. Vercel project setup

```bash
npm i -g vercel
cd ralph-dashboard
vercel link
```

### 3. Add Upstash Redis integration

1. Go to [Vercel Marketplace](https://vercel.com/marketplace) → search **Upstash Redis** → **Add Integration**
2. Select your project and create a Redis database
3. The integration auto-populates `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` as env vars

### 4. Pull environment variables

```bash
vercel env pull .env.local
```

This populates `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` automatically.

### 5. Set dashboard secret

Generate a secret:

```bash
openssl rand -hex 32
```

Add it to Vercel:

```bash
vercel env add DASHBOARD_SECRET
```

Paste the generated value when prompted (set for Production, Preview, and Development).

Then add the same value to the orchestrator's `.env`:

```
DASHBOARD_URL=https://your-app.vercel.app
DASHBOARD_SECRET=<same-value>
```

And enable it in `config.json`:

```json
{
  "dashboard": {
    "enabled": true,
    "intervalMs": 30000
  }
}
```

### 6. Deploy

```bash
vercel --prod
# or
npm run deploy
```

### 7. Local development

```bash
npm run dev
```

Runs at `http://localhost:3000`. Requires `.env.local` with Upstash Redis credentials (`UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`) and `DASHBOARD_SECRET`.

## API

### `POST /api/heartbeat`

Authenticated write endpoint. Each orchestrator sends periodic heartbeats identified by `agentId`.

**Headers**: `Authorization: Bearer <DASHBOARD_SECRET>`

```bash
curl -X POST https://your-app.vercel.app/api/heartbeat \
  -H "Authorization: Bearer YOUR_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "agentId": "550e8400-e29b-41d4-a716-446655440000",
    "status": "working",
    "queueSize": 3,
    "currentTask": "DF-2759",
    "currentTaskStartedAt": "2026-02-13T10:00:00.000Z",
    "profileId": "ralph-docs",
    "totalProcessed": 5,
    "lastCompletedTask": "DF-2758",
    "lastCompletedAt": "2026-02-13T09:50:00.000Z"
  }'
```

### `GET /api/status`

Public endpoint. Returns all connected agents.

```bash
curl https://your-app.vercel.app/api/status
```

Response:

```json
{
  "agents": [
    {
      "agentId": "550e8400-e29b-41d4-a716-446655440000",
      "status": "working",
      "currentTask": "DF-2759",
      "lastHeartbeat": "2026-02-13T10:00:30.000Z",
      ...
    }
  ]
}
```

### `GET /`

Public dashboard page. Auto-refreshes every 15 seconds. Renders one card per connected agent.

## Alternatives to Vercel

If you don't want to use Vercel, consider:

- **Cloudflare Workers + D1 (SQLite)** — generous free tier, replace `@upstash/redis` with Cloudflare KV or D1
- **Fly.io + SQLite** — free tier with persistent volume, use `better-sqlite3` instead of KV
- **Railway** — free trial, supports Redis or Postgres as backing store
