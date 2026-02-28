## Phase 6 Complete: Sidecar Infrastructure

Installed git in the MCP sidecar Dockerfile and mounted the repo volume into the sidecar container via compose overlay. Added `REPO_ROOT` environment variable so git-powered tools know where the repo is mounted.

**Files created/changed:**
- shared/mcp-sidecar/Dockerfile
- src/container/setup/compose-overlay.ts
- tests/container/compose-overlay.test.ts

**Functions created/changed:**
- `generateComposeOverlay()` — now includes repo volume mount and REPO_ROOT env on sidecar

**Tests created/changed:**
- Compose overlay: 2 new tests (repo volume mount, REPO_ROOT env var)

**Review Status:** APPROVED
