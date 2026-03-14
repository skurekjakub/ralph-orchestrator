# Migration Agent — User Guide

## What This Is

A 26-agent system that migrates a web application from one framework to another. You invoke the session orchestrator once — it autonomously dispatches coordinators, which dispatch specialists, all the way through a 7-pass pipeline until the migration is complete or a blocker is hit.

The agents share state through JSON artifact files in a `.migration/` directory. No database, no server, no runtime — just files.

## Prerequisites

- GitHub Copilot CLI (or Claude Code CLI)
- The legacy app's source code checked out locally
- The legacy app running and accessible via URL (for Playwright verification)
- A target directory for the migrated code

## Quick Start

### 1. Bootstrap

```bash
chmod +x .github/agents/migration-bootstrap.sh
.github/agents/migration-bootstrap.sh
```

This creates `.migration/` with seed files.

### 2. Configure

Edit `.migration/context.json`:

```json
{
  "source": {
    "codePath": "./legacy-app",
    "appUrl": "http://localhost:3000",
    "authCredentials": {
      "username": "admin",
      "password": "password123",
      "notes": "Delete this block if no auth needed"
    }
  },
  "target": {
    "framework": "Next.js 15 with App Router",
    "outputDirectory": "./migrated-app",
    "testFramework": "Vitest + Playwright",
    "notes": "Keep the same Postgres database, migrate from Express + EJS"
  },
  "constraints": [
    "Must preserve all API contracts — external consumers exist",
    "Admin panel can be rebuilt from scratch",
    "Keep the same URL structure for SEO"
  ]
}
```

**Required fields:**
- `source.codePath` — relative or absolute path to the legacy source
- `source.appUrl` — URL where the old app is running (Playwright hits this)
- `target.framework` — be specific (not just "React" — say "Next.js 15 App Router with RSC")
- `target.outputDirectory` — where migrated code lands
- `target.testFramework` — what the test-writer agent should use

**Optional but valuable:**
- `source.authCredentials` — if the app has login, the journey-validator needs these
- `target.notes` — architectural decisions, database strategy, anything the agents should know
- `constraints` — hard constraints the coder must respect (API compatibility, URL preservation, etc.)

### 3. Start the Orchestrator

```
@migration
```

The session orchestrator reads `context.json`, checks for existing progress, and autonomously dispatches the first coordinator. On a fresh start, it dispatches the discovery coordinator, which dispatches its 6 domain mappers, and so on — the full pipeline runs without further input.

### 4. What Happens Next

The orchestrator runs the 7-pass pipeline end to end:

1. Dispatches a coordinator as a subagent
2. The coordinator dispatches its specialists as subagents
3. Specialists write their artifacts and status files
4. Control returns to the coordinator, which checks completion
5. Control returns to the orchestrator, which updates `progress.json` and dispatches the next coordinator
6. Repeat until delivery is complete or a `blocked`/`escalated` status is hit

If a coordinator returns `blocked` or `escalated`, the orchestrator stops and reports the issue. Otherwise, the full migration runs autonomously.

## The 7-Pass Pipeline

| Pass | What Happens | You'll See |
|---|---|---|
| **1. Discovery** | 6 mappers scan source code — UI/CSS/a11y/i18n/SEO, routes/sitemap, API/auth/uploads, data/search/sessions, jobs/email/push, config/integrations/CI | `feature-inventory.json` populated across 6 domains |
| **2. Semantics** | Behavioral analysis of each feature | `behavior-matrix.json` with state transitions, invariants, error paths |
| **3. Planning** | Features decomposed into ordered migration slices | `task-graph.json` with dependency-ordered slices + `risk-register.json` |
| **4. Execution** | Coder implements each slice, reviewer checks, test-writer adds tests | Migrated code in `target.outputDirectory`, tests alongside |
| **5. Verification** | Playwright journey tests + API contract diffs per slice | `verification-matrix.json` with pass/fail per oracle |
| **6. Gap Hunting** | Adversarial search for anything missed | New features/slices added if found, cycle repeats |
| **7. Delivery** | Hardening check, documentation, handoff report | Final report in `.migration/agents/handoff-writer/output.md` |

Passes 4-6 can loop: if gap-hunter finds missing features, the system re-enters Pass 2 or 3. This continues until gap-hunter finds nothing new (convergence) or you decide coverage is sufficient.

## Checking Progress

Read `.migration/progress.json` at any time:

```json
{
  "counts": {
    "featuresDiscovered": 47,
    "featuresAnalyzed": 47,
    "slicesPlanned": 12,
    "slicesImplemented": 8,
    "slicesVerified": 6,
    "slicesFailedParity": 1,
    "slicesBlocked": 0
  },
  "gapHunting": {
    "cyclesCompleted": 1,
    "newItemsLastCycle": 3,
    "newItemsHistory": [3]
  },
  "passStatus": {
    "discovery": "completed",
    "semantics": "completed",
    "planning": "completed",
    "execution": "in-progress",
    "verification": "in-progress",
    "gapHunting": "not-started",
    "delivery": "not-started"
  }
}
```

**Convergence signal:** When `gapHunting.newItemsLastCycle` trends to 0, the migration is approaching completeness.

## Artifact Files

All state lives in `.migration/`:

| File | Written By | Purpose |
|---|---|---|
| `context.json` | You (manual) | Migration parameters — source, target, constraints |
| `progress.json` | Session orchestrator | Counts, pass statuses, gap-hunting convergence |
| `migration-manifest.json` | Every agent (prepend) | Chronological log of all agent actions |
| `feature-inventory.json` | Discovery mappers | All features by domain (ui, routes, api, data, jobs, config) |
| `behavior-matrix.json` | Semantics analyzer | State transitions, validation rules, invariants per feature |
| `dependency-graph.json` | Dependency analyzer | Feature-to-feature dependencies, migration clusters |
| `task-graph.json` | Slice planner | Dependency-ordered migration slices with inline invariants |
| `risk-register.json` | Risk analyzer | Per-slice risks with severity and mitigation |
| `rollback-plan.json` | Slice planner | Per-slice rollback steps |
| `verification-matrix.json` | Validators | Per-slice, per-oracle pass/fail results |
| `agents/*/status.json` | Each agent | Routing signal for coordinators/orchestrator |
| `agents/*/output.md` | Each agent | Narrative output (only read by humans, never by routers) |
| `slices/*/` | Coder, reviewer, test-writer | Per-slice implementation artifacts |

**Prepend-only rule:** `migration-manifest.json` is prepend-only — newest entries at the top. This lets agents read the most recent state first without scanning the entire file.

## Stopping and Resuming

The system is fully resumable. Every agent writes its state to files. If the session is interrupted (context limit, crash, manual stop), invoke `@migration` again and it:

1. Reads all `status.json` files to reconstruct where things left off
2. Reads `progress.json` for the overall picture
3. Dispatches the next logical coordinator and continues autonomously

You can also intervene between runs — edit artifacts, skip slices, or tell the orchestrator to jump to delivery.

## Intervening

You can manually edit any `.migration/` artifact between agent runs:

- **Add constraints:** Edit `context.json` to add new constraints mid-migration
- **Fix inventory:** If a mapper missed something, add it to `feature-inventory.json` manually
- **Skip a slice:** Set a slice's status to `verified` in `task-graph.json` to skip it
- **Force re-execution:** Set a slice's status back to `planned` to re-run it
- **Terminate early:** Tell the orchestrator to proceed to Pass 7 regardless of gap-hunting

## Agent Roster

### Orchestrator (1)
- `migration` — Pure router. Reads status files, dispatches coordinators.

### Coordinators (5)
- `migration-discovery-coordinator` — Dispatches 6 domain mappers
- `migration-planning-coordinator` — Routes semantics (Pass 2) and planning (Pass 3)
- `migration-execution-coordinator` — Routes coder→reviewer→test-writer per slice
- `migration-verification-coordinator` — Inline verification + gap-hunting batch mode
- `migration-delivery-coordinator` — Routes hardening→documentation→handoff

### Discovery Specialists (6)
- `migration-feature-mapper` — UI components, pages, layouts, CSS/design system, a11y markup, i18n in templates, SEO meta tags
- `migration-route-mapper` — Routes, navigation, URL patterns, SEO infra (sitemap, robots.txt), redirects
- `migration-api-mapper` — API endpoints, controllers, contracts, file uploads, auth flows, security headers
- `migration-data-mapper` — Data models, schemas, migrations, search indexes, session stores, caches
- `migration-job-mapper` — Background jobs, cron, workers, email/push/SMS pipelines, notifications
- `migration-config-mapper` — Config files, env vars, feature flags, 3rd-party integrations, auth providers, CI/CD, logging/APM

### Semantics Specialists (2)
- `migration-semantics-analyzer` — State transitions, validation, auth, error paths, invariants
- `migration-dependency-analyzer` — Feature dependency graph, migration clusters

### Planning Specialists (2)
- `migration-slice-planner` — Dependency-ordered task graph with inline invariants, validates all feature IDs exist in inventory
- `migration-risk-analyzer` — Risk assessment per slice across 6 categories

### Execution Specialists (3)
- `migration-coder` — Implements one slice at a time
- `migration-reviewer` — Invariant-by-invariant review, approves or rejects
- `migration-test-writer` — Writes runnable tests per slice

### Verification Specialists (4)
- `migration-journey-validator` — Playwright user journey comparisons
- `migration-contract-validator` — API contract diffing
- `migration-parity-checker` — Aggregates oracle results per slice
- `migration-gap-hunter` — Adversarial search for missed features

### Delivery Specialists (3)
- `migration-hardening-checker` — Production readiness (performance, resilience, rollback)
- `migration-documentation-writer` — Decision log, changelog, migration notes
- `migration-handoff-writer` — Executive summary, coverage report, recommendations

## Troubleshooting

**Agent says "context.json has empty fields"**
→ Fill in all required fields in `.migration/context.json`

**Orchestrator keeps dispatching the same coordinator**
→ The coordinator's `status.json` may be missing or malformed. Check `.migration/agents/<coordinator>/status.json`

**Coder reports "blocked"**
→ A dependency slice isn't verified yet. Check `task-graph.json` for the slice's `dependsOn` entries.

**Gap-hunter finds nothing on first cycle**
→ Suspicious. Read its `output.md` to verify it actually searched comprehensively. Re-run if the search methodology looks superficial.

**Verification fails but code looks correct**
→ The oracle may be testing against a stale app state. Make sure `source.appUrl` is running the original version.

## Starting Fresh

To reset and start over:

```bash
rm -rf .migration
.github/agents/migration-bootstrap.sh
```

Then edit `context.json` again and re-invoke the orchestrator.
