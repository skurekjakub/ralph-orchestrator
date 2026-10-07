# Known Failure Signatures

Catalog of observed failure patterns. Each entry describes the signature (what you see in the logs), the root cause, and the fix. Add new entries as you discover them.

---

## 1. Silent CLI Death (Exit 1, No Output)

**Signature:**

- `summary.json`: `status: "error"`, `exitCode: 1`, `durationMs` < 10s, `failureCategory: "infra"`
- Per-task `.log`: only `[build]`/`[setup]` lines, no `[claude]` or `[copilot]` lines
- The CLI's session export (`claude-sessions` or `session-state`) missing from `collectedLogs`
- Sidecar + proxy logs: normal (servers started, expected HTTP traffic)

**Root cause:** The CLI process crashed immediately on launch. Its stderr is in `summary.json` `stderr` and in the `CLI exited with code N — stderr:` warning from `executeCliCommand()`. A Claude Code session that started and then failed is not silent: its stream-json result names the error, which lands in `cliError` and `failureReason` (`auth-failed` for a rejected credential).

**Common underlying causes:**

- Copilot: a flag that persists a setting (e.g. `--experimental`) makes Copilot CLI exit 1 without output, since its `settings.json` is mounted read-only
- MCP config JSON syntax error
- Missing environment variable referenced in CLI flags
- A CLI binary missing from the image or of another version than `package.json` pins (rebuild the image)
- Auth token expired or malformed (`CLAUDE_CODE_OAUTH_TOKEN` or `ANTHROPIC_API_KEY` for Claude Code, per `claudeAuth`; `GH_TOKEN` for Copilot)

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

**Root cause:** The stage timeout (`timeoutMs` on the profile or stage) was exceeded. execa kills the host-side `docker compose exec` process and reports `timedOut`, which `resolveStatus()` maps to `partial`.

**Fix:** Increase the stage timeout in `profile.json`, or optimize the agent prompt to work faster.

---

## 4. MCP Server Startup Failure

**Signature:**

- Sidecar log shows `[gateway] <name> exited ...` and eventually `exceeded max restarts (3), giving up`
- Sidecar log may contain `Error: Cannot find module` or `EADDRINUSE`
- Agent tool calls to that server fail or the tools are missing

**Root cause:** An MCP server failed to start in the sidecar. The gateway (`shared/mcp-sidecar/src/gateway.ts`) retries it up to 3 times and keeps the other servers running, but `/health` stays 503, so a task whose sidecar never turns healthy fails before the agent starts. npm servers are stdio children of the gateway; `failed to start: initialize failed` means their MCP handshake failed. `[guard] <name>: refusing to serve` means a custom server bound an address other than `127.0.0.1`.

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

## 6. Workspace Creation Failure (TaskWorkspaceManager)

**Signature:**

- The task fails before `Starting containers`, with no container logs and no `summary.json`; the activity log, the ledger's `reason` and the issue's error comment hold the message
- The error names a git command (`clone --bare`, `fetch --prune origin`, `clone --local`, `checkout -B`) with `***` in place of the auth header, or reads `Base branch "…" does not exist on …`, `Revision branch "…" does not exist on …`, `<repoPat> must be set to clone …` or `Workspace … already exists`

**Root cause:** The remote is unreachable or rejects the PAT, the base branch (`source_branch` or the PR's target) or a revision's task branch is missing on the remote, or the profile's `cache/repos/<profileId>` clone is broken.

**Fix:** Check the PAT in the `repoPat` env var and the branch names on `repoUrl`. A broken bare clone can be deleted; the next task clones it again.

---

## 7. Continuation Loop Exhaustion

**Signature:**

- Activity log: `No result found — continuation k/N` repeated, then `All N continuation(s) exhausted without a result`
- `summary.json`: `status: "error"`, `failureReason: "missing-result-block"`, `failureCategory: "contract"`, no `prUrl`
- No result with an accepted `STATUS`: on Claude Code no `tool StructuredOutput` line in the per-task log, on Copilot no `===RALPH_RESULT_START===` block in the agent text
- `The agent's structured output does not match the result schema` in the activity log when Claude Code returned an object the orchestrator's schema rejects

**Root cause:** The agent ended its CLI sessions without reporting a result, and `ContinuationRunner` used up `maxContinuations`. The stage requires a result (`requireResultBlock`, on by default for variant stages), so the run fails and the work item gets an error comment instead of moving to review. With `maxContinuations: 0` you see the same outcome without the continuation lines.

**Fix:** Check that the stage root renders `<result-contract>` (`shared/agent-includes/result-contract.md`) and that its workflow's final phase sends it there. On Claude Code, check that the root's rendered agent file lists `StructuredOutput` in its `tools`: without it the session cannot return the result. Continuations need both `enableContinuation: true` in config.json and `maxContinuations > 0` in profile.json; the count may need to be higher.

---

## 9. Structured Output Retries Exhausted (Claude Code)

**Signature:**

- `summary.json`: `status: "error"`, `failureReason: "missing-result-block"`, `failureCategory: "contract"`, `cliError.subtype: "error_max_structured_output_retries"`, `cliError.message` naming the last validation error
- Per-task log: `tool StructuredOutput …` lines followed by `result: error_max_structured_output_retries`

**Root cause:** The agent called `StructuredOutput` with objects that kept failing `--json-schema` validation (a `STATUS` outside `completed`/`partial`/`blocked`, a field outside the schema, a non-string value) until Claude Code gave up. The retry limit is the CLI's `MAX_STRUCTURED_OUTPUT_RETRIES` environment variable; Ralph leaves it at its default.

**Fix:** Compare the rejected input in the transcript's `StructuredOutput` tool calls with `agentResultSchema` (`src/container/agent-result.ts`) and the workflow's final phase, and fix whichever asks for a value the schema does not allow.

---

## 8. Docker Build Failure

**Signature:**

- Per-task log ends in `[build]` lines with a Docker build error; there is no `summary.json`, and the activity log and the ledger's `reason` hold the error text
- Common in first run after Dockerfile changes

**Root cause:** The profile's Dockerfile has a syntax error, a missing base image, or a build step that fails.

**Fix:** Rebuild with the same three-file merge the orchestrator uses, so the full build output is visible:

```bash
docker compose -f profiles/<id>/docker-compose.yml \
  -f shared/security/docker-compose.security.yml \
  -f profiles/<id>/.build/docker-compose.overlay.yml build
```

---

## Adding New Signatures

When you discover a new failure pattern, add it here with:

1. **Signature** — What the logs show (be specific about which files and what values)
2. **Root cause** — Why it happens
3. **Fix** — How to resolve it
