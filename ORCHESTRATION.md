# Ralph Orchestration Notes — GitHub Copilot CLI in Headless Devcontainers

Reference document for orchestrating autonomous agent loops via `docker exec` against the Ralph devcontainer using GitHub Copilot CLI.

---

## 1. Authentication (Critical)

Copilot CLI authenticates via environment variables — **no interactive OAuth flow needed**.

| Variable | Purpose | Precedence |
|---|---|---|
| `GH_TOKEN` | Fine-grained PAT with **"Copilot Requests"** permission | 1st (highest) |
| `GITHUB_TOKEN` | Same, fallback | 2nd |

**The orchestrator must inject the token** either:
- As a Docker environment variable when creating the container (`-e GH_TOKEN=...`)
- Or via the `.env` file consumed by docker-compose

**PAT requirements**: Fine-grained token, scoped to the org/user, with the **"Copilot Requests"** permission. If the user belongs to an organization, the **Copilot CLI policy must be enabled** in the org settings.

> Without this token, `copilot` will prompt for `/login` (device flow) which blocks headless execution.

---

## 2. Invoking Copilot in Programmatic Mode

The core invocation pattern for the orchestrator:

```bash
docker exec -w /workspace <container> \
  copilot -p "Your prompt here" --yolo
```

### Key Flags

| Flag | Effect |
|---|---|
| `-p "prompt"` / `--prompt` | **Programmatic mode** — single prompt, no interactive session |
| `--yolo` / `--allow-all` | Enables **all permissions** at once (tool use, file writes, shell, paths, URLs) |
| `--allow-all-tools` | Allow all tools without approval prompts |
| `--allow-all-paths` | Disable path permission verification |
| `--allow-all-urls` | Disable URL permission verification |
| `--allow-tool 'shell'` | Allow all shell commands |
| `--allow-tool 'write'` | Allow all file writes |
| `--deny-tool 'shell(rm)'` | Deny specific dangerous commands even when `--allow-all-tools` is set |
| `--model MODEL` | Override the model (default: Claude Sonnet 4.5) |
| `--agent=NAME` | Use a specific custom agent profile |
| `-s` | **Silent mode** — output only Copilot's response text, omit usage info |

### Recommended Autonomous Invocation

```bash
# Full autonomy with safety rails
copilot -p "prompt" \
  --allow-all-tools \
  --allow-all-paths \
  --allow-all-urls \
  --deny-tool 'shell(rm -rf)' \
  --deny-tool 'shell(git push --force)'

# Or simply:
copilot -p "prompt" --yolo
```

### Piping Prompts

You can also pipe options/prompts into copilot:

```bash
echo '-p "Fix the failing tests"' | copilot --yolo
# Or from a script:
./generate-prompt.sh | copilot --yolo
```

---

## 3. Trusted Directories

On first interactive launch, Copilot asks to confirm you trust the cwd. For headless use, **pre-seed the config**:

```json
// ~/.copilot/config.json
{
  "trusted_folders": ["/workspace"]
}
```

The setup.sh already does this. The config location can be overridden via `XDG_CONFIG_HOME`.

---

## 4. Custom Instructions & Agent Profiles

Copilot CLI automatically discovers instruction files from **multiple locations** (all combined, not fallback):

| File/Path | Scope |
|---|---|
| `~/.copilot/copilot-instructions.md` | Global (all sessions) |
| `.github/copilot-instructions.md` | Repository-wide |
| `.github/instructions/**/*.instructions.md` | Path-specific (with `applyTo` frontmatter globs) |
| `AGENTS.md` (repo root or cwd) | Agent instructions (primary if at root) |
| `CLAUDE.md`, `GEMINI.md`, `Copilot.md` | Also read if present at repo root |
| `COPILOT_CUSTOM_INSTRUCTIONS_DIRS` env var | Comma-separated list of extra dirs to scan for `AGENTS.md` and `.instructions.md` files |

### Custom Agents for Ralph

Place agent Markdown files in:
- **User-level**: `~/.copilot/agents/` (all projects)
- **Repo-level**: `.github/agents/` (current project)

Invoke a specific agent:
```bash
copilot --agent=ralph-writer -p "Update the changelog" --yolo
```

Copilot can also **auto-infer** the agent from the prompt if you mention it by name.

---

## 5. MCP Server Configuration

Copilot CLI ships with the **GitHub MCP server** built-in. Additional servers are registered in:

```
~/.copilot/mcp-config.json
```

The setup.sh pre-seeds the Playwright MCP server. The JSON structure follows the same schema as VS Code's MCP config:

```json
{
  "servers": {
    "playwright": {
      "command": "npx",
      "args": ["@playwright/mcp@latest"]
    }
  }
}
```

---

## 6. Hooks (Session Lifecycle)

Hooks let the orchestrator inject **custom shell commands** at key points during agent execution. Place hooks in:

```
.github/hooks/hooks.json    (repo-level, loaded from cwd)
```

### Available Hook Points

| Hook | When |
|---|---|
| `sessionStart` | Session begins |
| `sessionEnd` | Session completes |
| `userPromptSubmitted` | After each prompt is submitted |
| `preToolUse` | Before a tool is executed |
| `postToolUse` | After a tool finishes |
| `errorOccurred` | When an error happens |

### Example: Logging Session Start/End for Ralph

```json
{
  "version": 1,
  "hooks": {
    "sessionStart": [
      {
        "type": "command",
        "bash": "echo \"[RALPH] Session started: $(date)\" >> /workspace/logs/ralph-sessions.log",
        "cwd": ".",
        "timeoutSec": 5
      }
    ],
    "sessionEnd": [
      {
        "type": "command",
        "bash": "echo \"[RALPH] Session ended: $(date)\" >> /workspace/logs/ralph-sessions.log",
        "cwd": ".",
        "timeoutSec": 5
      }
    ]
  }
}
```

This is powerful for the orchestrator to:
- Track session metrics
- Run linters/validators after tool use
- Inject security scanning on `preToolUse`

---

## 7. Session Management & Context

### Infinite Sessions

Copilot CLI auto-compacts conversation history at **95% context usage**. Sessions can theoretically run forever. However, for autonomous loops where the container is destroyed after each run, this is less relevant.

### Session State Location

```
~/.copilot/session-state/{session-id}/
├── events.jsonl      # Full session history
├── workspace.yaml    # Metadata
├── plan.md           # Implementation plan (if created)
├── checkpoints/      # Compaction snapshots
└── files/            # Persistent artifacts
```

### Resume Across Loops

If you want Ralph to resume a previous session (e.g., on the same volume):

```bash
copilot --continue  # Resume last session
copilot --resume    # Pick from available sessions
```

Since the Ralph container is **destroyed after every loop**, resumption only applies if `~/.copilot/` is persisted on a volume. For fresh-per-loop autonomy, this is not needed.

---

## 8. Model Selection

| Model | Best For | Multiplier |
|---|---|---|
| Claude Opus 4.5 | Complex architecture, difficult debugging | Higher cost |
| Claude Sonnet 4.5 (default) | Day-to-day coding, routine tasks | 1x |
| GPT-5.2 Codex | Code generation, code review | Varies |

Override per invocation:
```bash
copilot -p "Refactor the auth module" --model "claude-opus-4.5" --yolo
```

---

## 9. Delegation to Copilot Coding Agent (Cloud)

From within a CLI session, you can push work to run **in the cloud** on GitHub:

```bash
copilot -p "/delegate Add dark mode support" --yolo
```

This creates a **draft PR** and hands off to Copilot coding agent on GitHub.com. Useful for:
- Tangential tasks Ralph doesn't need to wait on
- Work on other repositories
- Long-running operations

---

## 10. Orchestrator Checklist

Before launching a Ralph loop iteration:

- [ ] `GH_TOKEN` is set with a PAT that has "Copilot Requests" permission
- [ ] Copilot CLI org policy is enabled (if org-managed subscription)
- [ ] `~/.copilot/config.json` has `/workspace` in `trusted_folders` (setup.sh handles this)
- [ ] Git is configured (`user.name`, `user.email`, `safe.directory`)
- [ ] Dependencies are installed (`bundle install`, `npm ci`)
- [ ] The working directory is `/workspace`

### Minimal Orchestrator Loop Example

```bash
#!/bin/bash
CONTAINER="ralph-sandbox-app-1"
PROMPT_FILE="/path/to/task-prompt.md"

# Inject prompt and run
docker exec -w /workspace \
  -e GH_TOKEN="$GH_TOKEN" \
  "$CONTAINER" \
  copilot -p "$(cat $PROMPT_FILE)" --yolo --model claude-sonnet-4.5

EXIT_CODE=$?
echo "Copilot exited with code: $EXIT_CODE"
```

### With a Custom Agent

```bash
docker exec -w /workspace \
  -e GH_TOKEN="$GH_TOKEN" \
  "$CONTAINER" \
  copilot --agent=ralph-docs -p "$(cat $PROMPT_FILE)" --yolo
```

---

## 11. Security Considerations

| Concern | Mitigation |
|---|---|
| `--yolo` grants full access | The container is ephemeral and isolated — acceptable risk |
| Secrets exposure | Never commit `.env` or tokens; inject via env vars at runtime |
| Destructive commands | Use `--deny-tool 'shell(rm -rf)'` if needed alongside `--allow-all-tools` |
| Network access | `--allow-all-urls` is implicit with `--yolo`; restrict if needed |
| Path scope | By default scoped to cwd + subdirs; `--allow-all-paths` lifts this |

GitHub's own recommendation: *"You can mitigate the risks associated with using the automatic approval options by using Copilot CLI in a restricted environment, such as a virtual machine, container, or dedicated system."* — which is exactly what Ralph is.

---

## 12. Key Differences from Claude Code CLI

| Feature | Claude Code CLI | GitHub Copilot CLI |
|---|---|---|
| Auth | `ANTHROPIC_API_KEY` env var | `GH_TOKEN` / `GITHUB_TOKEN` (PAT with Copilot Requests perm) |
| Install | `npm install -g @anthropic-ai/claude-code` | `npm install -g @github/copilot` |
| Full autonomy flag | `--dangerously-skip-permissions` | `--yolo` / `--allow-all` |
| Programmatic mode | `-p "prompt"` | `-p "prompt"` (identical) |
| MCP config | `claude mcp add ...` | `~/.copilot/mcp-config.json` |
| Custom instructions | `CLAUDE.md` | `.github/copilot-instructions.md`, `AGENTS.md`, `.instructions.md` files |
| Hooks | Not available | `.github/hooks/hooks.json` with lifecycle events |
| Cloud delegation | Not available | `/delegate` pushes to Copilot coding agent on GitHub |
| Session resume | Not available | `--continue` / `--resume` |
| Built-in GitHub integration | None | GitHub MCP server built-in (PRs, issues, actions) |
| Default model | Claude Sonnet 4 | Claude Sonnet 4.5 |
