# Known Failure Signatures

Catalog of observed failure patterns. Each entry describes the signature (what you see in the logs), the root cause, and the fix. Add new entries as you discover them.

---

## 1. Silent CLI Death (Exit 1, No Output)

**Signature:**
- `summary.json`: `status: "error"`, `exitCode: 1`, `durationMs` < 10s, `failureCategory: "infra"`
- Per-task `.log`: only `[build]`/`[setup]` lines, no `[copilot]` lines
- Session-state export missing from `collectedLogs`
- Sidecar + proxy logs: normal (servers started, expected HTTP traffic)

**Root cause:** The CLI process crashed immediately on launch. Its stderr is in `summary.json` `stderr` and in the `CLI exited with code N — stderr:` warning from `executeCliCommand()`. Summaries written before stderr capture was added lack the field; for those, only the logs remain.

**Common underlying causes:**
- Invalid `--config-dir` path (Copilot CLI)
- MCP config JSON syntax error
- Missing environment variable referenced in CLI flags
- Copilot CLI version incompatibility
- Auth token expired or malformed

**Fix:** Read `stderr` and fix the underlying cause. If it says `no stderr captured`, check the `shortMessage` in the same log line; it usually names a Docker-level failure.

---

## 2. OOM Kill (Exit 137)

**Signature:**
- `summary.json`: `exitCode: 137`
- Container log may show sudden stop mid-output
- `docker inspect` on the container shows `OOMKilled: true` (containers are removed at teardown, so inspect during a run)

**Root cause:** CLI or one of its subprocesses exceeded the container memory limit (8G in `shared/security/docker-compose.security.yml`).

**Fix:** Raise `deploy.resources.limits.memory` for `app` in `shared/security/docker-compose.security.yml` or optimize the agent's workflow to reduce memory.

---

## 3. Stage Timeout (status partial)

**Signature:**
- `summary.json`: `status: "partial"` (unless the agent had already printed a `STATUS:`), `durationMs` close to the stage timeout
- Per-task log shows CLI output that stops mid-work; with continuations enabled, the activity log shows `CLI session timed out — skipping continuation`

**Root cause:** The stage timeout (`timeoutMs` on the variant or stage) was exceeded. execa kills the host-side `docker compose exec` process and reports `timedOut`, which `resolveStatus()` maps to `partial`.

**Fix:** Increase the stage timeout in `profile.json`, or optimize the agent prompt to work faster.

---

## 4. MCP Server Startup Failure

**Signature:**
- Sidecar log shows `[gateway] <name> exited ...` and eventually `exceeded max restarts (3), giving up`
- Sidecar log may contain `Error: Cannot find module` or `EADDRINUSE`
- Agent tool calls to that server fail or the tools are missing

**Root cause:** An MCP server failed to start in the sidecar. The gateway (`shared/mcp-sidecar/src/gateway.ts`) retries it up to 3 times and keeps the other servers running. npm servers run under `supergateway`.

**Fix:** See the `mcp-deployment` skill (`references/troubleshooting.md`). Typical causes are a missing `dist/` bundle, wrong `args`/`containerPath`, a package missing from the sidecar Dockerfile, or a duplicate `sidecarPort`.

---

## 5. Squid Proxy Domain Denial

**Signature:**
- Proxy log contains `TCP_DENIED` for a domain the CLI or agent needs
- CLI may hang or error when trying to reach the blocked domain
- Often manifests as npm/pip install failures or API call timeouts

**Root cause:** The domain is not in the agent's Squid allowlist. MCP servers are not affected because they have direct egress from the sidecar.

**Fix:** Add the domain to the profile's `allowlistDomains` in `profile.json` (merged into `.build/squid.conf` at startup), or to the baseline `shared/security/squid.conf` if every profile needs it.

---

## 6. Git Checkout Failure (RepoSyncHook)

**Signature:**
- Activity log shows errors during `RepoSyncHook`
- Error mentions "modified files" or "untracked files" blocking checkout
- The CLI may run but on the wrong branch

**Root cause:** Previous bind-mount artifacts (`.ralph/`, `.github/skills/`, `.github/agents/`) are present in the target repo's working directory and block `git checkout`. The `RepoSyncHook` should write these to `.git/info/exclude`, but if it fails, the patterns aren't excluded.

**Fix:** Manually clean the target repo's working directory, or check that `RepoSyncHook` is executing before the checkout.

---

## 7. Continuation Loop Exhaustion

**Signature:**
- Activity log: `No result block found — continuation k/N` repeated, then `All N continuation(s) exhausted without a result block`
- `summary.json`: `exitCode: 0` and `status: "completed"` (no agent `STATUS:` → exit-code resolution), no `prUrl`
- No `===RALPH_RESULT_START===` block in output

**Root cause:** The agent ended its CLI sessions without producing a result block, and `ContinuationRunner` used up `maxContinuations`. Because exit 0 resolves to `completed`, the run looks successful even though no result was reported. With `maxContinuations: 0` you see the same outcome without the continuation lines.

**Fix:** Check the agent prompt to ensure it instructs the agent to emit the result block. Check `maxContinuations` in profile.json — it may need to be higher, or the agent prompt may need clarification.

---

## 8. Docker Build Failure

**Signature:**
- Per-task log ends in `[build]` lines with a Docker build error; `summary.json` has `durationMs: 0` and the error text in `stderr`
- Common in first run after Dockerfile changes

**Root cause:** The profile's Dockerfile has a syntax error, a missing base image, or a build step that fails.

**Fix:** Rebuild with the same three-file merge the orchestrator uses, so the full build output is visible:
```bash
docker compose -f profiles/<id>/docker-compose.yml \
  -f shared/security/docker-compose.security.yml \
  -f profiles/<id>/.build/docker-compose.overlay.yml build
```

---

## 9. Empty StreamCapture (Line Buffer Not Flushed)

**Signature:**
- Per-task log has output that ends mid-word or is missing the last few lines
- The container log shows the same truncation

**Root cause:** (Historical) `StreamCapture` used line-buffering but had no `close` handler to flush residual content when the process exited. If the CLI wrote partial lines (no trailing newline) before dying, those bytes were lost.

**Status:** Fixed. `StreamCapture` now flushes residual buffer on `close` for both stdout and stderr.

---

## Adding New Signatures

When you discover a new failure pattern, add it here with:
1. **Signature** — What the logs show (be specific about which files and what values)
2. **Root cause** — Why it happens
3. **Fix** — How to resolve it
