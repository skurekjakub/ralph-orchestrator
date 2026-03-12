# Known Failure Signatures

Catalog of observed failure patterns. Each entry describes the signature (what you see in the logs), the root cause, and the fix. Add new entries as you discover them.

---

## 1. Silent CLI Death (Exit 1, No Output)

**Signature:**
- `summary.json`: `status: "error"`, `exitCode: 1`, `durationMs` < 10s
- Per-task `.log`: contains only Docker setup output (npm/gem install), no CLI output
- Session state directory: empty or all artifacts "Failed to collect"
- Sidecar + proxy logs: normal (servers started, expected HTTP traffic)

**Root cause:** The CLI process crashed immediately on launch. The error went to stderr, but stderr was not captured in older versions. With the stderr logging fix, the error will appear in `summary.json.stderr` and in the activity log.

**Common underlying causes:**
- Invalid `--config-dir` path (Copilot CLI)
- MCP config JSON syntax error
- Missing environment variable referenced in CLI flags
- Copilot CLI version incompatibility
- Auth token expired or malformed

**Fix:** Re-run the task after the stderr logging fix is deployed. The actual error message will now be visible.

---

## 2. OOM Kill (Exit 137)

**Signature:**
- `summary.json`: `exitCode: 137`
- Container log may show sudden stop mid-output
- `docker inspect` on the container shows `OOMKilled: true`

**Root cause:** CLI or one of its subprocesses exceeded the container memory limit (default 8GB).

**Fix:** Increase `mem_limit` in the compose security overlay (`shared/security/docker-compose.security.yml`) or optimize the agent's workflow to reduce memory.

---

## 3. Timeout / SIGTERM (Exit 143)

**Signature:**
- `summary.json`: `exitCode: 143`, `durationMs` close to the stage timeout
- Per-task log shows CLI output that stops mid-work

**Root cause:** The stage timeout (`timeoutMs` in profile variant) was exceeded. The orchestrator sends SIGTERM to the compose exec process.

**Fix:** Increase the stage timeout in `profile.json`, or optimize the agent prompt to work faster.

---

## 4. MCP Server Startup Failure

**Signature:**
- Sidecar log shows fewer "listening" messages than expected
- Sidecar log may contain `Error: Cannot find module` or `EADDRINUSE`
- CLI may crash when it tries to call a tool from the missing server

**Root cause:** An MCP server failed to start in the sidecar. The sidecar's `supergateway` process manager logs the failure but continues with other servers.

**Fix:** Check the MCP server manifest (`shared/mcp-servers/<name>/mcp-server.json`), ensure the server code is built (`dist/` exists), and verify port assignments don't conflict.

---

## 5. Squid Proxy Domain Denial

**Signature:**
- Proxy log contains `TCP_DENIED` for a domain the CLI or agent needs
- CLI may hang or error when trying to reach the blocked domain
- Often manifests as npm/pip install failures or API call timeouts

**Root cause:** The domain is not in the Squid allowlist.

**Fix:** Add the domain to `shared/security/squid.conf` in the appropriate ACL section.

---

## 6. Git Checkout Failure (RepoSyncHook)

**Signature:**
- Activity log shows errors during `RepoSyncHook`
- Error mentions "modified files" or "untracked files" blocking checkout
- The CLI may run but on the wrong branch

**Root cause:** Previous bind-mount artifacts (`.ralph/`, `.github/skills/`, `.github/agents/`) are present in the repo working directory and block `git checkout`. The `RepoSyncHook` should write these to `.git/info/exclude`, but if it fails, the patterns aren't excluded.

**Fix:** Manually clean the target repo's working directory, or check that `RepoSyncHook` is executing before the checkout.

---

## 7. Continuation Loop Exhaustion

**Signature:**
- `summary.json`: `status: "error"`, longer `durationMs` (minutes), `exitCode: 0`
- Per-task log shows multiple CLI sessions (look for `--continue` flags)
- No `===RALPH_RESULT_START===` block in output

**Root cause:** The agent completed its CLI sessions without producing a result block. The continuation runner retried `maxContinuations` times but the agent never emitted the expected output format.

**Fix:** Check the agent prompt to ensure it instructs the agent to emit the result block. Check `maxContinuations` in profile.json — it may need to be higher, or the agent prompt may need clarification.

---

## 8. Docker Build Failure

**Signature:**
- Activity log shows errors during `docker compose build`
- No per-task log directory created (the container never started)
- Common in first run after Dockerfile changes

**Root cause:** The profile's Dockerfile has a syntax error, a missing base image, or a build step that fails.

**Fix:** Run `docker compose build` manually for the profile to see the full build output:
```bash
docker compose -f profiles/<id>/docker-compose.yml build
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
