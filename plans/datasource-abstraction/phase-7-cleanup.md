# Phase 7: Cleanup & Documentation

> **Effort:** Small (1-2 days)
> **Depends on:** Phase 6

## Goal

Final cleanup — consolidate JIRA code under the connector directory, remove dead code, update all documentation and config samples.

## Tasks

### 7.1 Move `src/jira/` Under Connector

Move remaining JIRA-specific code into the connector namespace:

```
src/jira/client.ts        → src/datasource/connectors/jira/jira-client.ts
src/jira/types.ts         → src/datasource/connectors/jira/jira-types.ts
src/jira/field-extractor.ts → src/datasource/connectors/jira/field-extractor.ts
src/jira/jql-builder.ts   → src/datasource/connectors/jira/jql-builder.ts
src/jira/poller.ts        → (already replaced by jira-poller.ts in Phase 2)
```

After the move, `src/jira/` directory is deleted entirely. All JIRA-specific code lives under `src/datasource/connectors/jira/`.

Update all imports in:
- `src/datasource/connectors/jira/jira-connector.ts`
- `src/datasource/connectors/jira/jira-data-mapper.ts`
- `src/datasource/connectors/jira/jira-content-extractor.ts`
- `src/datasource/connectors/jira/jira-poller.ts`
- Corresponding test files

### 7.2 Remove Dead Code

- Delete `src/jira/` directory (all files moved)
- Remove unused ADF extraction utilities if any remain standalone
- Remove any `extractAdfText` imports outside the JIRA connector
- Remove old `IJiraPoller` interface if fully replaced by `IWorkItemPoller`
- Remove `buildJqlFromProfiles` from any top-level exports
- Clean up `src/util/jira.ts` — `assertValidIssueKey` becomes JIRA-connector-internal or generalized to `assertValidItemId`

### 7.3 Rename Macros in Profile Configs

Update all `profile.json` files — replace `$jira.*` macro references with `$task.*`:

| Old Macro | New Macro |
|-----------|-----------|
| `$jira.key` | `$task.id` |
| `$jira.project` | `$task.project` |
| `$jira.branch` | `$task.branch` |
| `$jira.summary` | `$task.title` |

Scan all `profiles/*/profile.json` for `$jira.` and replace.

### 7.4 Update Documentation

| File | Changes |
|------|---------|
| `README.md` | Update architecture section, mention data source abstraction |
| `ARCHITECTURE.md` | Update source directory map — `src/datasource/` replaces `src/jira/` |
| `CONFIGURATION.md` | Document `dataSources` map, per-source config, `dataSource` in profiles |
| `config.json.sample` | Update to new schema with `dataSources` |
| `CLAUDE.md` | Update architecture, key files, config format sections |
| `.github/copilot-instructions.md` | Update architecture diagram, source directory map, JIRA integration section, config section |
| `MCP.md` | Update macro references from `$jira.*` to `$task.*` |
| `SECURITY.md` | Any JIRA-specific security notes |
| `DEPENDENCY-INJECTION.md` | Update cradle registration examples |

### 7.5 Update Config Sample

**File:** `config.json.sample`

Ensure it shows the new `dataSources` shape with at least one JIRA example and a commented-out future source.

### 7.6 Verify No Leakage

Final grep to confirm:
```bash
# No JiraIssue/JiraComment imports outside the connector
grep -r "from.*jira/" src/ --include="*.ts" | grep -v "datasource/connectors/jira"
# Should return 0 results

# No $jira.* macros in profiles
grep -r "\$jira\." profiles/
# Should return 0 results

# No jira.* template variables in agent includes
grep -r "jira\." shared/agent-includes/ profiles/*/agents/
# Should return 0 results (excluding literal JIRA references in prose)
```

## Validation

- `npm run lint` passes
- `npm test` passes
- `src/jira/` directory no longer exists
- All JIRA code lives under `src/datasource/connectors/jira/`
- Documentation reflects new architecture
- Config sample shows `dataSources` schema
- Grep checks pass (no leakage)
