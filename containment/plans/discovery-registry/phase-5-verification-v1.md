# Phase 5: Verification — End-to-End Consistency Check

**Goal**: Verify all changes are internally consistent: naming conventions match across agents, gap-hunter reads what agents write, bootstrap creates what agents expect, and documentation matches implementation.
**Dependencies**: Phases 1–4 (all changes complete).
**Outputs consumed by**: None — this is the terminal phase.

---

## Tasks

### 5.1 — Verify naming convention consistency

**Type**: Verification

Cross-check that every agent's discovery file path matches the canonical naming pattern documented in `overview.md`.

**Checks**:

| Agent | Expected Path | File |
|-------|--------------|------|
| code-analyzer | `discoveries/code-analyzer--global--c{cycle}.json` | docwriter-code-analyzer.agent.md |
| content-writer | `discoveries/content-writer--{task-id}--c{cycle}.json` | docwriter-content-writer.agent.md |
| impact-mapper | `discoveries/impact-mapper--global--c{cycle}.json` | docwriter-impact-mapper.agent.md |
| research-scout | `discoveries/research-scout--global--c{cycle}.json` | docwriter-research-scout.agent.md |
| cross-ref-updater | `discoveries/cross-ref-updater--global--c{cycle}.json` | docwriter-cross-ref-updater.agent.md |

**Acceptance Criteria**:
- [ ] All 5 agents use exact naming convention from overview.md
- [ ] Global agents use `global`, per-task agents use `{task-id}`
- [ ] Cycle suffix format is consistent (`c{cycle}` with integer)

---

### 5.2 — Verify gap-hunter reads what agents write

**Type**: Verification

The gap-hunter's glob pattern `discoveries/*.json` must match the file paths all 5 agents produce. Verify the glob is correct and that Step 7 handles the JSON schema each agent writes.

**Checks**:
- All agent file paths are under `.docwriter/discoveries/` ✓
- All files end in `.json` ✓
- Gap-hunter Step 7 references the correct schema fields (`agent`, `context`, `cycle`, `discoveries[]`)
- Discovery entry fields match across all agents (`id`, `type`, `summary`, `evidence`, `suggestedAction`, `affectedArea`, `severity`)

**Acceptance Criteria**:
- [ ] Gap-hunter glob matches all 5 agents' file paths
- [ ] Schema fields referenced in Step 7 match schema in agent prompts
- [ ] Discovery types used by agents (`undocumented-behavior`, `missing-coverage`, `stale-content`, `cross-cutting-concern`, `scope-expansion`) are all covered by Step 7's type mapping

---

### 5.3 — Verify bootstrap lifecycle correctness

**Type**: Verification

- Fresh bootstrap creates `discoveries/`
- `--clean` removes `discoveries/` (not in preserve list) and recreates it
- `--clean` preserve list does NOT include `discoveries`

**Acceptance Criteria**:
- [ ] Fresh bootstrap `mkdir -p` includes `discoveries/`
- [ ] `--clean` recreate block includes `discoveries/`
- [ ] `--clean` `find` exclusion list does NOT include `discoveries`

---

### 5.4 — Verify ROUTING-ARCHITECTURE.md completeness

**Type**: Verification

Check that every pass that produces discoveries is annotated, the gap-hunter input list includes discoveries, and the re-entry section covers accumulation.

**Acceptance Criteria**:
- [ ] Passes 1, 2, 4, 5 show optional discovery outputs
- [ ] Pass 6 reads include `discoveries/*.json`
- [ ] P-02 re-entry explains accumulation
- [ ] Degraded mode covers missing discoveries
- [ ] Artifact chain includes `discoveries/*.json`

---

### 5.5 — Verify changelog completeness

**Type**: Verification

Changelog entry mentions all 5 agents, execution-coordinator, gap-hunter, bootstrap, and ROUTING-ARCHITECTURE.md updates.

**Acceptance Criteria**:
- [ ] All 5 leaf agents listed by name with file naming convention
- [ ] Execution-coordinator awareness documented
- [ ] Gap-hunter Step 7 documented
- [ ] Bootstrap changes documented
- [ ] ROUTING-ARCHITECTURE.md changes summarized
