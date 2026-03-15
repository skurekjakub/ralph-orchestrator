# Phase 1: Foundation — Bootstrap & Directory Lifecycle

**Goal**: Establish the `discoveries/` directory, its lifecycle across fresh/clean/re-entry modes, and the canonical discovery file schema.
**Dependencies**: None — this is the foundation phase.
**Outputs consumed by**: Phase 2 (agents need the directory to write to), Phase 3 (gap-hunter needs to know the schema to consume).

---

## Tasks

### 1.1 — Add `discoveries/` to fresh bootstrap

**File**: `.fractals/docwriter/docwriter-bootstrap.sh`

The fresh bootstrap path (the `else` branch starting ~line 57) creates `.docwriter/` directories. `discoveries/` must be created alongside `agents/` and `tasks/`.

**Changes**:

1. Add `mkdir -p "$ARTIFACT_DIR/discoveries"` in the fresh bootstrap section, after the `tasks/` directory creation (around line 63).

**Acceptance Criteria**:
- [ ] Fresh bootstrap creates `.docwriter/discoveries/` directory
- [ ] Directory is created in the same block as `agents/` and `tasks/`

---

### 1.2 — Add `discoveries/` to `--clean` mode

**File**: `.fractals/docwriter/docwriter-bootstrap.sh`

The `--clean` mode (lines 35–52) preserves certain artifacts and removes everything else, then recreates `agents/`, `tasks/`, and `synthesis-signals/`. `discoveries/` should NOT be preserved (it's cycle-specific, not persistent like `meta/`) but it MUST be recreated after cleanup.

**Changes**:

1. In the `--clean` recreate block (after line 51), add `mkdir -p "$ARTIFACT_DIR/discoveries"`.
2. `discoveries` is NOT in the preserve list (the `find` command's `! -name` exclusions) — this is correct by default since it's not listed.

**Acceptance Criteria**:
- [ ] `--clean` removes existing `discoveries/` directory (verified by absence from exclusion list)
- [ ] `--clean` recreates empty `discoveries/` directory after cleanup
- [ ] Recreate line is alongside `agents/`, `tasks/`, `synthesis-signals/` recreations

---

### 1.3 — Document the discovery file schema in overview.md

**File**: `plans/discovery-registry/overview.md`

Already done as part of this plan. The schema is documented in the overview. No additional work needed — this task exists for completeness tracking.

**Acceptance Criteria**:
- [ ] Discovery entry schema documented with all fields (id, type, summary, evidence, suggestedAction, affectedArea, severity)
- [ ] File naming convention documented with examples
