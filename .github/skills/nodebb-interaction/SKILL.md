---
name: nodebb-interaction
description: Guide for working with NodeBB forum instances — REST API usage, authentication, topic/post/category management, tagging, search, token administration, and CI test infrastructure. Use when building NodeBB integrations, writing NodeBB API clients, creating MCP servers that talk to NodeBB, seeding test data, setting up CI pipelines with ephemeral NodeBB instances, or debugging NodeBB API interactions.
---

# NodeBB Interaction Guide

This skill covers the NodeBB REST API (v3), authentication patterns, common operations, and CI infrastructure for ephemeral NodeBB instances.

## API Overview

NodeBB exposes two parallel REST APIs:

| API | Base Path | Purpose |
|---|---|---|
| **Read API** | `/api/` | Read-only access — topics, posts, categories, search, user profiles |
| **Write API** | `/api/v3/` | Mutations — create topics, reply, edit, delete, manage tokens, admin |

Both APIs return JSON with a standard envelope:

```json
{
  "status": { "code": "ok", "message": "OK" },
  "response": { /* payload */ }
}
```

Full API reference: https://docs.nodebb.org/api/read/ (Read), https://docs.nodebb.org/api/write/ (Write).

---

## Authentication

NodeBB supports two authentication methods:

### Bearer Token (Recommended for APIs/MCP Servers)

```
Authorization: Bearer <token>
```

Bearer tokens work for both Read and Write API calls. No CSRF token needed. This is the standard approach for programmatic access.

**Creating tokens programmatically:**

1. Login via cookie-based auth first:
   ```
   POST /api/v3/utilities/login
   Body: { "username": "admin", "password": "..." }
   ```
   Response sets session cookies.

2. Get CSRF token:
   ```
   GET /api/config
   ```
   Response contains `csrf_token` field.

3. Create admin token:
   ```
   POST /api/v3/admin/tokens
   Headers: { "x-csrf-token": "<csrf>", "Cookie": "<session>" }
   Body: { "uid": 1, "description": "API access" }
   ```
   Response contains `token` field (UUID format, e.g. `864df45f-...`).

### Cookie-Based Session

Login via `/api/v3/utilities/login`, then pass cookies on subsequent requests. **Non-GET requests require a CSRF token** in the `x-csrf-token` header (obtained from `/api/config`).

---

## Core Operations

### Topics

**Create a topic:**
```
POST /api/v3/topics/
Body: {
  "cid": 5,
  "title": "DOC-1234: Updated API documentation",
  "content": "Markdown content here...",
  "tags": ["DOC-1234", "api-docs", "documentation"]
}
```

**Get a topic (with all posts):**
```
GET /api/topic/{tid}          (Read API — rendered HTML content)
GET /api/v3/topics/{tid}      (Write API — raw data)
```

The Read API `/api/topic/{tid}` returns full topic data including all posts with rendered content, category info, and tags. Each post includes `content` (HTML), `user` info, and `timestamp`.

**Reply to a topic:**
```
POST /api/v3/topics/{tid}
Body: {
  "content": "Reply content in markdown",
  "toPid": 0    // optional — reply to specific post
}
```

**Delete a topic:**
```
DELETE /api/v3/topics/{tid}        — Purge (permanent)
DELETE /api/v3/topics/{tid}/state  — Soft delete (restorable)
```

### Tags

**Set tags on a topic (replaces all):**
```
PUT /api/v3/topics/{tid}/tags
Body: { "tags": ["new-tag", "other-tag"] }
```

**Add tags (append):**
```
PATCH /api/v3/topics/{tid}/tags
Body: { "tags": ["additional-tag"] }
```

**Remove all tags:**
```
DELETE /api/v3/topics/{tid}/tags
```

Tags are searchable. The category listing API returns tags for each topic as `tags: [{ value, valueEscaped, valueEncoded, class }]`.

### Categories

**List all categories:**
```
GET /api/v3/categories/
```

**Get topics in a category:**
```
GET /api/v3/categories/{cid}/topics
Query params: ?after=0&categoryTopicSort=newest_to_oldest
```

Returns paginated topics with `nextStart` for pagination. Topics include `tags` array. The `after` parameter is an offset index (not a page number).

**Create a category:**
```
POST /api/v3/categories/
Body: { "name": "my-category", "description": "..." }
```

### Posts

**Edit a post:**
```
PUT /api/v3/posts/{pid}
Body: { "content": "Updated content", "title": "New title" }
```
The `title` field is only accepted for main posts (first post in a topic).

**Get raw post content:**
```
GET /api/v3/posts/{pid}/raw
```

### Search

**Search topics/posts:**
```
GET /api/search?term=keyword&categories[]=5&sortBy=timestamp&sortDirection=desc
```

The search API scopes to categories via `categories[]` parameter. Returns topics with matched posts. For better fuzzy matching in MCP servers, combine search API results with category topic listings processed through Fuse.js.

### Users

**Get user profile:**
```
GET /api/v3/users/{uid}
```

**Create a user:**
```
POST /api/v3/users/
Body: { "username": "botname", "password": "...", "email": "bot@example.org" }
```

---

## Practical Patterns

### Resolving Category Name to ID

When you have a category name (string) but need the numeric `cid`:

```typescript
const res = await fetch(`${baseUrl}/api/categories`);
const data = await res.json();
const cat = data.categories.find(c => c.name === categoryName);
const cid = cat?.cid;
```

### Paginating Category Topics

```typescript
let after = 0;
const allTopics = [];
while (true) {
  const res = await fetch(`${baseUrl}/api/v3/categories/${cid}/topics?after=${after}`);
  const { response } = await res.json();
  allTopics.push(...response.topics);
  if (!response.topics.length || response.nextStart <= after) break;
  after = response.nextStart;
}
```

### Seeding Test Data

When seeding topics for testing, use the Write API with Bearer auth:

```javascript
const create = async (title, content, tags) => {
  const res = await fetch(`${baseUrl}/api/v3/topics`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ cid, title, content, tags })
  });
  return res.json();
};
```

### Searching with Fuse.js (Fuzzy + OR)

For MCP servers, combine NodeBB's native search with local fuzzy matching for better results:

```typescript
import Fuse from "fuse.js";

// Merge search API results with category topics
const fuse = new Fuse(candidates, {
  keys: [
    { name: "title", weight: 2 },
    { name: "tags", weight: 2 },
    { name: "content", weight: 1 }
  ],
  threshold: 0.4,
  distance: 200,
  useExtendedSearch: true
});

// Split query words into OR expression
const orQuery = query.trim().split(/\s+/).join(" | ");
const results = fuse.search(orQuery);
```

---

## CI Infrastructure

### Ephemeral NodeBB for Integration Tests

Use a minimal Docker Compose stack with a custom entrypoint for non-interactive setup:

**`docker-compose.ci.yml`:**
```yaml
services:
  nodebb:
    image: ghcr.io/nodebb/nodebb:latest
    ports: ["4567:4567"]
    entrypoint: ["/bin/bash", "/opt/nodebb/entrypoint.ci.sh"]
    volumes:
      - ./nodebb/config.ci.json:/tmp/config.ci.json:ro
      - ./nodebb/entrypoint.ci.sh:/opt/nodebb/entrypoint.ci.sh:ro
    depends_on:
      mongodb:
        condition: service_healthy
  mongodb:
    image: mongo:7-jammy
    environment:
      MONGO_INITDB_ROOT_USERNAME: nodebb
      MONGO_INITDB_ROOT_PASSWORD: nodebb
```

**`entrypoint.ci.sh`:**
```bash
#!/bin/bash
set -e
mkdir -p /opt/config
cp /tmp/config.ci.json /opt/config/config.json
cd /opt/nodebb
./nodebb setup --config=/opt/config/config.json \
  '{"admin:username":"admin","admin:password":"RalphAdmin123!","admin:password:confirm":"RalphAdmin123!","admin:email":"admin@ralphchives.local"}'
node app --config=/opt/config/config.json
```

Key points:
- `setup.json` only pre-fills the web installer form — it does NOT auto-run setup. Use `./nodebb setup --config=... '{admin JSON}'` instead.
- The admin JSON **must** include `admin:password:confirm` — NodeBB setup requires it.
- Use `node app` (not `./nodebb start`) to run in foreground for Docker.
- Healthcheck: `curl -sf http://localhost:4567/api/config` (returns JSON with CSRF token when ready).

### CI Seed → Test → Teardown Pattern

```bash
# 1. Start stack
docker compose -f docker-compose.ci.yml up -d --wait --wait-timeout 300

# 2. Seed test data (outputs env vars to stdout)
eval $(node scripts/seed-test-data.mjs 2>/dev/null)

# 3. Run tests with env vars
NODEBB_API_TOKEN=$NODEBB_API_TOKEN \
NODEBB_CATEGORY_ID=$NODEBB_CATEGORY_ID \
NODEBB_API_URL=$NODEBB_API_URL \
npx vitest run tests/

# 4. Teardown
docker compose -f docker-compose.ci.yml down --volumes --remove-orphans
```

The seed script logs in as admin (cookie auth), creates a test category, generates an API token, then seeds topics. It outputs env vars to stdout and progress to stderr, so `eval $(script 2>/dev/null)` captures just the vars.

---

## Gotchas & Lessons Learned

- **`/api/` vs `/api/v3/`**: Read endpoints use `/api/` (e.g. `/api/topic/5`, `/api/search`). Write endpoints use `/api/v3/` (e.g. `/api/v3/topics/`). Mixing them up returns 404s or HTML.
- **Tags in category listings**: The category topics endpoint (`GET /api/v3/categories/{cid}/topics`) returns tags on each topic, but the search API (`/api/search`) does not always include tags in results. Prefer category listings when you need tag data.
- **Pagination offset**: The `after` parameter in category topics is a zero-based index (not a page). The response's `nextStart` value is the next offset.
- **CSRF only for cookie auth**: Bearer token auth does not need CSRF tokens. Only cookie-based sessions require `x-csrf-token` on non-GET requests.
- **Topic creation always needs content**: The Write API does not allow creating a topic without a post body. Both `title` and `content` are required.
- **Soft delete vs purge**: `DELETE /api/v3/topics/{tid}` purges permanently. Use `DELETE /api/v3/topics/{tid}/state` for soft delete (restorable with `PUT .../state`).
- **Tag search weight**: When building search tools, weight tags equally to titles (2x content weight) — tags are concise identifiers that strongly signal relevance.
- **Docker runner issues**: Self-hosted CI runners may not have Docker pre-installed or the daemon running. Handle with `sudo dockerd &` + polling loop if systemd is unavailable.

---

## Ralphchives MCP Architecture

In this project, NodeBB is used as the backing store for **Ralphchives** — a persistent knowledge base shared by AI agents. Two MCP servers provide tool access:

### ralphchives-read (Port 9107)

| Tool | Purpose |
|---|---|
| `search_ralphchives` | Fuzzy OR search across topics (title w:2, tags w:2, content w:1) |
| `get_topic` | Full topic with all posts/replies |
| `list_recent_topics` | Browse recent topics in a category (paginated) |

### ralphchives-write (Port 9106)

| Tool | Purpose |
|---|---|
| `post_task_report` | Create topic for completed task (title convention: `ISSUE-KEY: description`) |
| `post_observation` | Create observation topic (auto-prefixed `[Observation]`, auto-tagged) |
| `reply_to_thread` | Add reply to existing topic |

Both servers resolve `NODEBB_CATEGORY_NAME` to a numeric `cid` at startup. When the env var `NODEBB_CATEGORY_ID` is already set, the `categoryId` parameter is removed from tool schemas to simplify the agent's interface.

Auth flows through Bearer tokens stored in `gateway.json` inside the MCP sidecar container — the agent container never sees the credentials directly. Each profile gets its own category and token via `$variantEnv.NODEBB_TOKEN` macros in `profile.json`.
