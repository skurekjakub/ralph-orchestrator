---
name: nodebb-interaction
description: Guide for working with NodeBB forum instances — REST API usage, authentication, topic/post/category management, tagging, search, token administration, and CI test infrastructure. Use when building NodeBB integrations, writing NodeBB API clients, creating MCP servers that talk to NodeBB, seeding test data, setting up CI pipelines with ephemeral NodeBB instances, or debugging NodeBB API interactions.
---

# NodeBB Interaction Guide

This skill covers the NodeBB REST API (v3), authentication patterns, common operations, and CI infrastructure for ephemeral NodeBB instances.

## API Overview

NodeBB exposes two parallel REST APIs:

| API           | Base Path  | Purpose                                                              |
| ------------- | ---------- | -------------------------------------------------------------------- |
| **Read API**  | `/api/`    | Read-only access — topics, posts, categories, search, user profiles  |
| **Write API** | `/api/v3/` | Mutations — create topics, reply, edit, delete, manage tokens, admin |

Both APIs return JSON with a standard envelope:

```json
{
  "status": { "code": "ok", "message": "OK" },
  "response": {
    /* payload */
  }
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
const cat = data.categories.find((c) => c.name === categoryName);
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
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ cid, title, content, tags }),
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
    { name: "content", weight: 1 },
  ],
  threshold: 0.4,
  distance: 200,
  useExtendedSearch: true,
});

// Split query words into OR expression
const orQuery = query.trim().split(/\s+/).join(" | ");
const results = fuse.search(orQuery);
```

---

## CI Infrastructure

### Ephemeral NodeBB for Integration Tests

The repo already has the stack. Read and reuse it rather than writing a new one:

| File                                            | Role                                                                                                                            |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `ralphchives/docker-compose.ci.yml`             | NodeBB + MongoDB with a custom entrypoint and healthchecks                                                                      |
| `ralphchives/nodebb/entrypoint.ci.sh`           | Non-interactive `./nodebb setup` + `node app` in the foreground                                                                 |
| `ralphchives/nodebb/config.ci.json`             | Seed config copied to `/opt/config/config.json`                                                                                 |
| `ralphchives/scripts/seed-test-data.mjs`        | Logs in as admin, creates a test category + API token, seeds topics; prints `KEY=value` env lines on stdout, progress on stderr |
| `.github/workflows/ralphchives-integration.yml` | CI job: start stack → seed → run `ralphchives-read`/`ralphchives-write` integration tests → teardown                            |

Key points:

- `setup.json` only pre-fills the web installer form and does NOT run setup. Use `./nodebb setup --config=... '{admin JSON}'`.
- The admin JSON **must** include `admin:password:confirm`.
- Run `node app` (not `./nodebb start`) so the container stays in the foreground.
- Readiness check: `curl -sf http://localhost:4567/api/config` (returns JSON with a CSRF token once ready).

### Seed → Test → Teardown (same as CI, from the repo root)

```bash
docker compose -f ralphchives/docker-compose.ci.yml up -d --wait --wait-timeout 300
node ralphchives/scripts/seed-test-data.mjs > /tmp/seed-env.txt && set -a && . /tmp/seed-env.txt && set +a
(cd shared/mcp-servers/ralphchives-read && npx vitest run tests/search-integration.test.ts)
(cd shared/mcp-servers/ralphchives-write && npx vitest run tests/write-integration.test.ts)
docker compose -f ralphchives/docker-compose.ci.yml down --volumes --remove-orphans
```

---

## Gotchas & Lessons Learned

- **`/api/` vs `/api/v3/`**: Read endpoints use `/api/` (e.g. `/api/topic/5`, `/api/search`). Write endpoints use `/api/v3/` (e.g. `/api/v3/topics/`). Mixing them up returns 404s or HTML.
- **Tags in category listings**: The category topics endpoint (`GET /api/v3/categories/{cid}/topics`) returns tags on each topic, but the search API (`/api/search`) does not always include tags in results. Prefer category listings when you need tag data.
- **Pagination offset**: The `after` parameter in category topics is a zero-based index (not a page). The response's `nextStart` value is the next offset.
- **CSRF only for cookie auth**: Bearer token auth does not need CSRF tokens. Only cookie-based sessions require `x-csrf-token` on non-GET requests.
- **Topic creation always needs content**: The Write API does not allow creating a topic without a post body. Both `title` and `content` are required.
- **Soft delete vs purge**: `DELETE /api/v3/topics/{tid}` purges permanently. Use `DELETE /api/v3/topics/{tid}/state` for soft delete (restorable with `PUT .../state`).
- **Tag search weight**: When building search tools, weight tags equally to titles (2x content weight) — tags are concise identifiers that strongly signal relevance.
- **Docker on CI runners**: the integration workflow requires Docker + the compose plugin to already be on the self-hosted runner and fails fast otherwise; CI never installs or starts Docker on the host.

---

## Ralphchives MCP Architecture

In this project, NodeBB is used as the backing store for **Ralphchives** — a persistent knowledge base shared by AI agents. Two MCP servers provide tool access:

### ralphchives-read (Port 9107)

| Tool                 | Purpose                                                          |
| -------------------- | ---------------------------------------------------------------- |
| `search_ralphchives` | Fuzzy OR search across topics (title w:2, tags w:2, content w:1) |
| `get_topic`          | Full topic with all posts/replies                                |
| `list_recent_topics` | Browse recent topics in a category (paginated)                   |

### ralphchives-write (Port 9106)

| Tool               | Purpose                                                                      |
| ------------------ | ---------------------------------------------------------------------------- |
| `post_task_report` | Create topic for completed task (title convention: `ISSUE-KEY: description`) |
| `post_observation` | Create observation topic (auto-prefixed `[Observation]`, auto-tagged)        |
| `reply_to_thread`  | Add reply to existing topic                                                  |

Both servers resolve `NODEBB_CATEGORY_NAME` to a numeric `cid` at startup. When the env var `NODEBB_CATEGORY_ID` is already set, the `categoryId` parameter is removed from tool schemas to simplify the agent's interface.

Auth flows through Bearer tokens stored in `gateway.json` inside the MCP sidecar container — the agent container never sees the credentials directly. Each profile gets its own category and token via `$variantEnv.NODEBB_TOKEN` macros in `profile.json`.
