---
name: documentation-maintenance
description: "Guide for keeping project documentation in sync after code changes. Covers which docs to update, what structures go stale, duplication risks, and per-change-type checklists. Use this skill after implementing a feature, fixing a bug, adding config fields, changing profile structure, modifying Docker/compose infrastructure, or any change that affects documented behavior. Also use when auditing docs for staleness, checking cross-references, or when the user mentions updating docs, syncing docs, doc drift, or stale documentation. Triggers on: update docs, sync documentation, which docs need updating, doc maintenance, stale docs, documentation audit, keep docs up to date."
---

# Documentation Maintenance

This skill guides the process of keeping project documentation in sync after code changes. It covers the canonical doc inventory, duplication map, staleness patterns, and per-change-type checklists.

## Canonical Documentation Inventory

Every document that references source code, config, or architecture — and what it contains:

### Primary Architecture Docs

| Document | Key Structures | Staleness Risk |
|---|---|---|
| `ARCHITECTURE.md` | Component details (20+ subsections with `src/` file paths), profile infrastructure tree, Ink dashboard panel table, agent phase workflow, log collection paths | HIGH — scattered file path references throughout |
| `.github/copilot-instructions.md` | Source Directory Map (18-row table), brief summaries with links to primary docs, conventions | HIGH — directory map breaks on any `src/` reorganization |
| `CLAUDE.md` | Key Files table (24 rows), commands block, architecture summary, profile structure tree, conventions | MEDIUM — key files table breaks on renames |

### Configuration Docs

| Document | Key Structures | Staleness Risk |
|---|---|---|
| `CONFIGURATION.md` | Env vars table, data source fields, profile-level fields (14+), variant fields, stage fields, MCP runtime macros, output/dashboard/prompt-audit settings, profile.json schema example | MEDIUM — new config fields are invisible if not added here |
| `README.md` | Output directory tree (primary), responsibility split table, JIRA API endpoints, setup guide (links to CONFIGURATION.md for env vars) | LOW-MEDIUM |

### Domain-Specific Docs (in `docs/`)

| Document | Covers |
|---|---|
| `docs/agent-templates.md` | Template locations, rendering pipeline, template variable reference table |
| `docs/compose-layering.md` | Three-file compose merge pattern, layer responsibilities |
| `docs/multistage-pipelines.md` | Stage config fields, execution modes, stage context variables |
| `docs/mcp-sidecar-design.md` | MCP isolation architecture, network topology, HTTP transport |
| `docs/data-source-registration.md` | Plugin pattern, factory registration, third-party integration |
| `docs/security-audit-exfiltration.md` | Threat model, risk vectors, domain allowlist analysis |
| `SECURITY.md` | Network isolation, proxy rules, container hardening, host loopback |
| `MCP.md` | Server architecture, compose merge, MCP config structure |
| `DEPENDENCY-INJECTION.md` | Interface/class convention, cradle as sole composition root |

### Diagrams

| Document | Format | Covers |
|---|---|---|
| `DATAFLOW.drawio` | XML (DrawIO v26) | Visual dataflow: JIRA → Poller → TriggerScanner → Ledger → TaskRunner → Docker → Results. Open in draw.io or VS Code DrawIO extension to edit. |

## Single-Source-of-Truth Map

Each piece of documentation lives in one primary source. Other docs reference it rather than duplicating.

| Content | Primary Source | References From |
|---|---|---|
| Profile infrastructure tree | `ARCHITECTURE.md` | `copilot-instructions.md` (bullet summary + link) |
| Env vars + config fields | `CONFIGURATION.md` | `README.md` (link), `copilot-instructions.md` (link) |
| Output layout | `README.md` | `CLAUDE.md` (link), `copilot-instructions.md` (link) |
| Component details | `ARCHITECTURE.md` | `copilot-instructions.md` (link), `CLAUDE.md` (summary) |
| Security / hardening | `ARCHITECTURE.md` + `SECURITY.md` | `copilot-instructions.md` (brief + link) |
| Compose merge pattern | `docs/compose-layering.md` | `ARCHITECTURE.md`, `copilot-instructions.md` |
| Source directory map | `copilot-instructions.md` (table) | Unique — no duplication |
| Key files table | `CLAUDE.md` | Unique — no duplication |
| Conventions | Both `copilot-instructions.md` and `CLAUDE.md` | Intentional — each serves a different AI tool |
| Commands | Both `copilot-instructions.md` and `CLAUDE.md` | Intentional — each serves a different AI tool |

**Rule:** When adding new content, put it in the primary source and add a reference link from other docs. Do not duplicate prose or tables.

## Change-Type Checklists

### Added or renamed a source file / directory

- [ ] `.github/copilot-instructions.md` → "Source Directory Map" table
- [ ] `ARCHITECTURE.md` → relevant component subsection
- [ ] `CLAUDE.md` → "Key Files" table (if it's a key service file)

### Added or modified a config field

- [ ] `src/config/types.ts` → type definition
- [ ] `src/config/schemas.ts` → Zod schema
- [ ] `CONFIGURATION.md` → appropriate field table (profile-level, variant, stage, global)
- [ ] `config.json.sample` → example value if applicable

### Added or modified an environment variable

- [ ] `.env.example` or setup instructions
- [ ] `CONFIGURATION.md` → "Environment Variables" table (primary source)
- [ ] `CLAUDE.md` → if it affects commands or setup

### Changed Docker / compose infrastructure

- [ ] `docs/compose-layering.md` → layer descriptions
- [ ] `ARCHITECTURE.md` → profile infrastructure tree (primary source)
- [ ] `SECURITY.md` → if network isolation or hardening changed
- [ ] `MCP.md` → if MCP sidecar/transport changed
- [ ] `docs/mcp-sidecar-design.md` → if sidecar architecture changed

### Changed profile structure or fields

- [ ] `CONFIGURATION.md` → profile-level fields table, variant fields, stage fields
- [ ] `ARCHITECTURE.md` → profile infrastructure tree (primary source)
- [ ] `CLAUDE.md` → "Profile Structure" tree (abbreviated)
- [ ] `docs/multistage-pipelines.md` → if stage fields changed

### Added or modified MCP servers

- [ ] `MCP.md` → server registry, config structure
- [ ] `CONFIGURATION.md` → MCP servers section, runtime macros table
- [ ] `docs/mcp-sidecar-design.md` → if transport or isolation changed
- [ ] `.github/copilot-instructions.md` → MCP least-privilege section
- [ ] Profile `mcpServers` declarations in relevant `profile.json` files

### Changed agent template system

- [ ] `docs/agent-templates.md` → template variable reference, rendering pipeline
- [ ] `docs/AGENT-PROMPT-AUTHORING.md` → design patterns
- [ ] `.github/copilot-instructions.md` → agent template section
- [ ] `CLAUDE.md` → "Agent Templates — JIT Rendering" section

### Changed log collection or output layout

- [ ] `README.md` → "Output" directory tree (primary source)
- [ ] `ARCHITECTURE.md` → log collection subsection

### Changed data source / plugin system

- [ ] `docs/data-source-registration.md` → plugin pattern, factory interface
- [ ] `CONFIGURATION.md` → data sources section
- [ ] `.github/copilot-instructions.md` → "Data Source Plugins" section
- [ ] `CLAUDE.md` → "Data Source Plugins" section

### Changed security controls

- [ ] `SECURITY.md` → relevant section (network, proxy, hardening, caps)
- [ ] `docs/security-audit-exfiltration.md` → threat model if attack surface changed
- [ ] `shared/security/squid.conf` → domain allowlist if domains changed
- [ ] `.github/copilot-instructions.md` → security sections

## Staleness Detection

When auditing docs for staleness, check these high-risk areas:

1. **Path references** — grep for `src/` paths in all `.md` files; verify each path still exists
2. **Key files table** — compare `CLAUDE.md` Key Files entries against actual files in `src/`
3. **Directory map** — compare `.github/copilot-instructions.md` Source Directory Map against `ls src/`
4. **Config field counts** — compare field tables in `CONFIGURATION.md` against Zod schemas in `src/config/schemas.ts`
5. **Profile infrastructure tree** — compare the tree in `ARCHITECTURE.md` against actual directory structure
6. **Env vars** — compare the table in `CONFIGURATION.md` against `.env` loading in `src/config/loader.ts`

## Conventions

- **Explain why, not what** — doc updates follow the same comment convention as code
- **Tables over prose** — use Markdown tables for field references, directory maps, and structured data
- **Full relative paths** — always use `src/container/lifecycle.ts`, never just `lifecycle.ts`
- **No changelog notes** — docs describe current state, not what changed
- **DrawIO diagrams** — edit `DATAFLOW.drawio` in draw.io or the VS Code extension; it's XML under the hood
