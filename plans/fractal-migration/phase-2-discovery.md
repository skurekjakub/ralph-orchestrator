# Phase 2: Discovery Agents

**Status:** not-started
**Agents:** 7 (1 coordinator + 6 specialists)
**Dependencies:** Phase 0 (scaffold), Phase 1 (session orchestrator)

## Objective

Map the visible and structural surface area of the legacy system. Produces `feature-inventory.json` with all discoverable features across 6 domains.

## Agents

### `discovery-coordinator.agent.md`

**Role:** Pure router. Dispatches 6 domain mappers sequentially, reads their `status.json`, validates completeness.

**Prompt requirements:**
- List of 6 children with domain keys: `ui`, `routes`, `api`, `data`, `jobs`, `config`
- Dispatch order (any order — no dependencies between mappers)
- After each child completes: check its `status.json` for `result: mapped`
- After all 6 complete: validate `feature-inventory.json` has entries in all 6 domain keys
- If any mapper reports `failed` or `blocked`, write own status as `partial` with details
- When all 6 are `mapped`, write own `status.json` with `result: mapped`

**Inputs:** Child `status.json` files only
**Outputs:** `.migration/agents/discovery-coordinator/status.json`

---

### Specialist: `feature-mapper.agent.md`

**Domain key:** `ui`
**Reads:** Source code — components, pages, views, layouts, shared UI elements
**Writes:** Features in `feature-inventory.json` under domain `ui`

---

### Specialist: `route-mapper.agent.md`

**Domain key:** `routes`
**Reads:** Router configurations, navigation files, URL patterns, middleware chains
**Writes:** Features in `feature-inventory.json` under domain `routes`

---

### Specialist: `api-mapper.agent.md`

**Domain key:** `api`
**Reads:** API handlers, controllers, OpenAPI/Swagger specs, middleware, serializers
**Writes:** Features in `feature-inventory.json` under domain `api`

---

### Specialist: `data-mapper.agent.md`

**Domain key:** `data`
**Reads:** Models, schemas, migrations, ORM configs, seed files, data access layers
**Writes:** Features in `feature-inventory.json` under domain `data`

---

### Specialist: `job-mapper.agent.md`

**Domain key:** `jobs`
**Reads:** Job queues, cron configurations, worker processes, scheduled tasks, event handlers
**Writes:** Features in `feature-inventory.json` under domain `jobs`

---

### Specialist: `config-mapper.agent.md`

**Domain key:** `config`
**Reads:** Environment variable files, feature flags, config readers, build configs, deployment configs
**Writes:** Features in `feature-inventory.json` under domain `config`

---

## Shared Specialist Prompt Requirements

Every specialist prompt must include:

### Read-modify-write rule
```
1. Read .migration/feature-inventory.json (create if doesn't exist)
2. Add/update entries in your domain key section ONLY
3. Preserve all entries from other domains
4. Update the domains.<key>.featureIds array
5. Recompute summary.totalFeatures and summary.byStatus
6. Write the file back
```

### Feature entry schema
```json
{
  "id": "F-NNN",
  "domain": "<your-domain-key>",
  "name": "Human-readable feature name",
  "description": "What this feature does",
  "source": {
    "files": ["path/to/source.ts"],
    "routes": ["/route/pattern"],
    "entryPoints": ["ComponentName or function name"]
  },
  "status": "discovered",
  "confidence": 0.8,
  "unknowns": ["Anything uncertain — list it, don't guess"],
  "dependencies": [],
  "tags": ["domain-relevant", "tags"],
  "discoveredBy": "<agent-name>",
  "discoveredAt": "<run date -u command>",
  "lastUpdatedBy": "<agent-name>",
  "lastUpdatedAt": "<run date -u command>"
}
```

### ID assignment rule
Read existing feature IDs. Find the highest `F-NNN` number. Your first new entry is `F-(highest+1)`. If no entries exist, start at `F-001`.

### Confidence scoring
- 1.0 — explicit, unambiguous, fully traced
- 0.8 — high confidence, clear code path, minor ambiguities
- 0.6 — moderate confidence, some inference required
- 0.4 — low confidence, significant unknowns
- 0.2 — speculative, needs deeper analysis

### Unknowns rule
If you're not sure about something, add it to the `unknowns` array. Do NOT inflate `confidence` by guessing. Uncertainty is valuable information for later passes.

### Standard artifact contract
- Write `status.json` with `result: mapped`
- Prepend to `migration-manifest.json` (newest first)
- Write `output.md` with narrative summary of what was found

## Verification

- [ ] `feature-inventory.json` exists and is valid JSON
- [ ] All 6 domain keys present in `domains` object
- [ ] `domains.<key>.featureIds` matches actual feature IDs with that domain
- [ ] Feature IDs are unique across all domains
- [ ] Every feature has `confidence` > 0
- [ ] Every feature has non-empty `source.files`
- [ ] At least some features have non-empty `unknowns` (no unknowns is suspicious)
- [ ] `summary.totalFeatures` equals the actual count of entries in `features`
- [ ] `summary.byStatus.discovered` equals `summary.totalFeatures` (all should be `discovered` at this stage)
- [ ] All 6 specialist `status.json` files exist with `result: mapped`
- [ ] `migration-manifest.json` has 6+ entries (one per specialist)
- [ ] Discovery coordinator `status.json` exists with `result: mapped`
