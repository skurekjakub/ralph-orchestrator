# Container Security — Suspicious Command Detection, Permissions, & Parameter Hardening

## What This Is

Three related container security improvements:

1. **Suspicious command pause**: The observer detects dangerous commands (rm -rf, curl piped to bash, etc.) in the Copilot CLI output and pauses/kills the process
2. **Root/vscode file permissions**: Investigate and fix the DAC_OVERRIDE/CHOWN capability requirements in container workspace cleanup
3. **Hardbake issue/PR IDs into MCP servers**: Remove parameterization of sensitive identifiers — the agent can't change which issue or repo it operates on

## Suspicious Command Detection

### Current State

The `ContainerObserver` monitors streaming output from the CLI process. Currently it watches for the `===RALPH_RESULT_START===` marker and timeout conditions. It doesn't inspect individual tool calls or commands.

### Expected Behavior

The observer's stream parser scans for patterns indicating dangerous operations:

- `rm -rf /` or `rm -rf ~` (workspace-destructive)
- `curl ... | bash` or `wget ... | sh` (remote code execution)
- `docker` commands (shouldn't be possible — Docker CLI is removed, but defense in depth)
- `sudo` (shouldn't be possible — no sudo in container)
- `chmod 777` on sensitive paths
- Any command touching `/etc/passwd`, `/etc/shadow`, environment variable dumps

### Response Actions

When a suspicious command is detected:

1. **Log**: Record the command in the audit trail with a security flag
2. **Pause**: Send SIGSTOP to the CLI process (if possible via exec) — gives a human time to review
3. **Kill**: For the most dangerous patterns, kill the process immediately
4. **JIRA comment**: Post a warning comment on the issue noting the suspicious activity

### Codebase Impact

- `src/container/streaming-capture.ts` or a new `security-monitor.ts`: Pattern matching on streamed output
- `src/services/task-runner.ts` or `ContainerObserver`: Hook the security monitor into the output stream
- New config: `security.suspiciousPatterns` — configurable pattern list with severity levels
- Needs careful regex to avoid false positives (e.g., `rm -rf` on the agent's own temp directory is fine)

## Root/Vscode File Permissions

### Current State

The container runs as the `vscode` user (UID 1000). Docker volumes are mounted as root-owned. The `ContainerWorkspaceCleaner` needs to delete files in these volumes between runs, which requires `DAC_OVERRIDE` and `CHOWN` capabilities — capabilities that weaken the security posture.

The `docker-compose.security.yml` has:

```yaml
cap_drop:
  - ALL
cap_add:
  - DAC_OVERRIDE
  - CHOWN
```

### Root Cause

The volumes are root-owned because Docker creates them as root by default. The `vscode` user can't delete root-owned files without elevated capabilities.

### Solutions

1. **Fix volume ownership**: Use `--user` in the Dockerfile's volume initialization or run `chown` during container startup (in an entrypoint script running as root before dropping to vscode)
2. **Remove DAC_OVERRIDE/CHOWN**: Once volumes are properly owned by vscode, these capabilities can be dropped
3. **Use named volumes with proper permissions**: Docker named volumes can be configured with specific ownership
4. **Entrypoint chown**: A minimal entrypoint script that runs as root, chowns the workspace, then `exec`s the main process as vscode

### Codebase Impact

- `profiles/*/Dockerfile`: Add entrypoint script or adjust volume ownership
- `shared/security/docker-compose.security.yml`: Remove `DAC_OVERRIDE`, `CHOWN` from `cap_add`
- `src/container/workspace-cleaner.ts`: May need adjustments if the cleanup approach changes
- Integration testing: verify cleanup works without the elevated capabilities

## Hardbake Issue/PR IDs into MCP Servers

### Current State

MCP tools receive parameters from the agent at call time. The agent decides which JIRA issue to comment on, which ADO repo to create a PR in, which PR to update. If the agent hallucinates or is prompt-injected, it could operate on the wrong issue/repo.

### Expected Behavior

The MCP sidecar gateway pre-fills certain parameters so the agent can't override them:

- `jira_add_comment`: `issueKey` always set to the current task's issue key
- `jira_add_attachment`: `issueKey` always set to current task's issue key
- `ado_create_pull_request`: `repositoryId` always set to the profile's target repo
- `ado_list_pull_requests`: `repositoryId` always set to the profile's target repo

The agent sees the tools but certain parameters are invisible/immutable — they're injected by the gateway before forwarding to the actual MCP server.

### Implementation Approach

The `gateway.json` already contains per-server configuration. Add a `parameterOverrides` section:

```json
{
  "servers": [
    {
      "name": "jira-kentico",
      "parameterOverrides": {
        "jira_add_comment": { "issueKey": "DOC-3143" },
        "jira_add_attachment": { "issueKey": "DOC-3143" }
      }
    }
  ]
}
```

The gateway intercepts `tools/call` requests, applies overrides, then forwards. The agent's tool schema listing hides the overridden parameters.

### Codebase Impact

- `shared/mcp-sidecar/gateway.ts`: Parameter injection middleware
- `src/container/setup/gateway-config.ts` (or equivalent): Generate `parameterOverrides` from the current task context (issue key, repo name)
- `gateway.json` becomes task-specific (regenerated per task, not just per profile)
- MCP server manifests: declare which parameters are overrideable

### Security Value

This is significant — it means even a prompt-injected agent can only operate on its own issue and its own repository. It can't be tricked into commenting on a different issue or creating PRs in a different repo.

## Open Questions

- **Command detection latency**: Stream parsing adds latency to the output pipeline. Is the pattern matching fast enough to not slow down the agent's UX?
- **False positive handling**: What if `rm -rf` appears in a code sample the agent is discussing? Need context-aware detection (inside a code block vs. actual command execution).
- **Volume ownership at scale**: Different Linux distributions handle Docker volume ownership differently. The solution needs to work on both developer machines and CI/CD environments.
- **Parameter hardening granularity**: Should ALL tool parameters be lockable, or only specific ones? Over-restriction could break legitimate agent workflows.
