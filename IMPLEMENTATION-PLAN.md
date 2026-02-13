# Ralph Orchestrator — Implementation Plan

## Overview

The Ralph Orchestrator is a standalone Node.js + TypeScript application that polls JIRA for documentation tasks, spins up the Ralph devcontainer, executes the autonomous meta-agent, and collects results. It processes **one task at a time**, queuing additional tasks found during polling.

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                  JIRA (Atlassian Cloud)              │
│            project: DF    filter: "Ralph" in title   │
│            status: NEW only                          │
└──────────────┬──────────────────────────┬────────────┘
               │ poll every 60s           │ comment + transition
               ▼                          ▲
┌──────────────────────────────────────────────────────┐
│              Ralph Orchestrator (Node.js)             │
│                                                      │
│  ┌──────────┐  ┌───────────┐  ┌──────────────────┐  │
│  │  JIRA    │→ │  Queue    │→ │  Container       │  │
│  │  Poller  │  │  (in-mem) │  │  Lifecycle Mgr   │  │
│  └──────────┘  └───────────┘  └────────┬─────────┘  │
│                                        │             │
│  ┌──────────────────────────────────┐  │             │
│  │  Dashboard (ink terminal UI)     │  │             │
│  └──────────────────────────────────┘  │             │
│                                        │             │
│  ┌──────────────────────────────────┐  │             │
│  │  Log Collector                   │  │             │
│  └──────────────────────────────────┘  │             │
└────────────────────────────────────────┼─────────────┘
                                         │
               devcontainer exec         │
               docker cp                 │
                                         ▼
┌──────────────────────────────────────────────────────┐
│              Ralph Devcontainer                       │
│                                                      │
│  copilot --agent ralph --experimental --yolo          │
│           -p "<jira issue JSON>"                      │
│                                                      │
│  ┌─────────┐   ┌──────────┐   ┌──────────────────┐  │
│  │ ralph   │──▶│ ralph    │──▶│ ralph            │  │
│  │ (meta)  │   │ tech-    │   │ reviewer         │  │
│  │         │◀──│ writer   │◀──│                  │  │
│  └─────────┘   └──────────┘   └──────────────────┘  │
│                                                      │
│  ADO MCP → create branch, push, create PR            │
│  Hooks   → audit.jsonl logging                       │
└──────────────────────────────────────────────────────┘
```

---

## Components

### 1. Configuration (`config.json` / `.env`)

```jsonc
{
  "jira": {
    "baseUrl": "https://kentico.atlassian.net",
    "email": "user@kentico.com",
    "project": "DF",
    "jql": "project = DF AND summary ~ 'Ralph' AND status = 'New'",
    "pollIntervalMs": 60000,
    "inProgressTransitionId": "21",    // JIRA transition ID for New → In Progress
    "doneTransitionId": "31"           // JIRA transition ID for → Done (optional)
  },
  "ralph": {
    "repoPath": "/absolute/path/to/kentico-docs-jekyll",
    "devcontainerConfig": ".ralph/devcontainer.json",
    "agentName": "ralph",
    "timeoutMs": 1800000               // 30 min max per task
  },
  "output": {
    "logDir": "./output/logs",
    "handoffDir": "./output/handoffs"
  }
}
```

Secrets via `.env`:
```
GH_TOKEN=ghp_...
ADO_PAT_DOCS=...
ADO_PAT_XPERIENCE=...
ADO_MCP_AUTH_TOKEN=...     # same as ADO_PAT_DOCS
JIRA_PAT=...
JIRA_EMAIL=user@kentico.com
```

### 2. JIRA Poller (`src/jira/poller.ts`)

- Polls JIRA REST API v3 every 60s using the configured JQL
- Fetches full issue details (summary, description, comments, labels, components, acceptance criteria)
- Prunes null/empty fields from the response
- Pushes discovered issues into the in-memory queue
- Skips issues already in the queue or currently being processed
- Uses Basic Auth: `email:apiToken`

### 3. JIRA Client (`src/jira/client.ts`)

Methods:
- `searchIssues(jql)` → Issue[]
- `getIssue(key)` → full issue JSON
- `addComment(key, body)` → void
- `transitionIssue(key, transitionId)` → void

### 4. Queue (`src/queue.ts`)

Simple in-memory FIFO queue:
- `enqueue(issue)` — add issue (deduplicates by key)
- `dequeue()` → Issue | undefined
- `peek()` → Issue | undefined
- `size` → number
- `items` → readonly Issue[] (for dashboard)

### 5. Container Lifecycle Manager (`src/container/manager.ts`)

Responsibilities:
1. **Start**: `devcontainer up --workspace-folder <repoPath> --config <config>`
2. **Execute**: `devcontainer exec --remote-env ... -- copilot --agent ralph --experimental --yolo -p "<prompt>"`
3. **Collect logs**: `docker cp <container>:/workspace/.ralph/logs/audit.jsonl ./output/...`
4. **Collect handoff**: `docker cp <container>:/workspace/resources/chats/<key>/handoff.md ./output/...`
5. **Stop**: `devcontainer down --workspace-folder <repoPath>`

The prompt passed to copilot is the pruned JIRA issue JSON, formatted as:
```
JIRA Issue: <KEY>
Title: <summary>
Description: <description in markdown>
Acceptance Criteria: <if present>
Components: <if present>
Labels: <if present>
```

### 6. Orchestrator Loop (`src/orchestrator.ts`)

```
start():
  startPoller()
  startDashboard()
  
  while (running):
    if (ralphBusy): 
      sleep(5s)
      continue
    
    issue = queue.dequeue()
    if (!issue): 
      sleep(5s)
      continue
    
    ralphBusy = true
    currentIssue = issue
    
    try:
      // JIRA: mark in progress + comment
      jira.transitionIssue(issue.key, inProgressTransitionId)
      jira.addComment(issue.key, "🤖 Ralph is starting work on this issue.")
      
      // Container: start, execute, collect
      container.start()
      result = container.execute(issue)
      logs = container.collectLogs(issue.key)
      handoff = container.collectHandoff(issue.key)
      
      // JIRA: comment with results + PR link
      jira.addComment(issue.key, formatCompletionComment(result, handoff))
      
      // Container: stop
      container.stop()
      
    catch (error):
      jira.addComment(issue.key, formatErrorComment(error))
      container.stop()
    
    finally:
      ralphBusy = false
      currentIssue = null
```

### 7. Dashboard (`src/dashboard.tsx`)

Terminal UI using `ink` (React for terminal):

```
┌──────────────────────────────────────────┐
│  🤖 Ralph Orchestrator                   │
│                                          │
│  Status: WORKING                         │
│  Current: DF-2704 — Add custom modules   │
│  Elapsed: 4m 32s                         │
│                                          │
│  Queue (2):                              │
│    1. DF-2711 — Update email builder     │
│    2. DF-2715 — Fix API reference        │
│                                          │
│  Completed today: 3                      │
│  Last: DF-2700 — ✅ completed (12m)      │
│                                          │
│  Logs: ./output/logs/                    │
│  Ctrl+C to stop                          │
└──────────────────────────────────────────┘
```

### 8. Log Collector (`src/logs/collector.ts`)

After each ralph execution:
1. `docker cp` the `audit.jsonl` from the container
2. Save to `./output/logs/<issue-key>-<timestamp>.jsonl`
3. `docker cp` the handoff file
4. Save to `./output/handoffs/<issue-key>/handoff.md`

---

## Project Structure

```
ralph-orchestrator/
├── package.json
├── tsconfig.json
├── .env.example
├── config.json
├── .gitignore
├── src/
│   ├── index.ts                    # Entry point
│   ├── config.ts                   # Config loading
│   ├── orchestrator.ts             # Main loop
│   ├── queue.ts                    # In-memory task queue
│   ├── jira/
│   │   ├── client.ts              # JIRA REST API client
│   │   ├── poller.ts              # JQL polling loop
│   │   └── types.ts               # JIRA type definitions
│   ├── container/
│   │   ├── manager.ts             # Devcontainer lifecycle
│   │   └── types.ts               # Container types
│   ├── logs/
│   │   └── collector.ts           # Audit log + handoff collection
│   └── dashboard/
│       ├── App.tsx                 # Ink root component
│       ├── StatusPanel.tsx         # Current status display
│       ├── QueuePanel.tsx          # Queue display
│       └── HistoryPanel.tsx        # Completed tasks
├── output/                         # Gitignored runtime output
│   ├── logs/
│   └── handoffs/
└── README.md
```

---

## Dependencies

```json
{
  "dependencies": {
    "ink": "^5.1.0",
    "react": "^18.3.1",
    "dotenv": "^16.4.0",
    "execa": "^9.0.0"
  },
  "devDependencies": {
    "typescript": "^5.7.0",
    "@types/node": "^22.0.0",
    "@types/react": "^18.3.0",
    "tsx": "^4.19.0"
  }
}
```

No JIRA SDK — use the REST API directly with native `fetch` (Node 22+ built-in). Keeps dependencies minimal.

---

## JIRA Integration Details

### Authentication
Basic Auth with email + API token:
```
Authorization: Basic base64(email:apiToken)
```

### JQL Query
```
project = DF AND summary ~ "Ralph" AND status = "New" ORDER BY created ASC
```

### Key API Calls

| Action | Method | Endpoint |
|---|---|---|
| Search issues | GET | `/rest/api/3/search?jql=...` |
| Get issue details | GET | `/rest/api/3/issue/{key}` |
| Add comment | POST | `/rest/api/3/issue/{key}/comment` |
| Transition issue | POST | `/rest/api/3/issue/{key}/transitions` |

### JIRA Comments Format

**On start:**
```
🤖 Ralph has started working on this issue.
Branch: ralph/<key>-<slug>
```

**On completion:**
```
🤖 Ralph has completed this task.

**Status:** completed
**Branch:** ralph/<key>-<slug>
**Pull Request:** <PR link>
**Duration:** 12m 34s

**Changes:**
- Created: src/_documentation/...
- Updated: src/_documentation/...

**Handoff:** See PR description for full details.
```

**On error:**
```
🤖 Ralph encountered an error and could not complete this task.
**Error:** <message>
**Partial work:** Branch ralph/<key>-<slug> may contain partial changes.
```

---

## Container Execution Details

### Prompt Construction

The JIRA issue is serialized to a clean text prompt:

```typescript
function buildPrompt(issue: JiraIssue): string {
  const parts = [
    `JIRA Issue: ${issue.key}`,
    `Title: ${issue.fields.summary}`,
  ];
  
  if (issue.fields.description) {
    parts.push(`Description:\n${adfToMarkdown(issue.fields.description)}`);
  }
  // ... acceptance criteria, components, labels (skip nulls)
  
  return parts.join('\n\n');
}
```

### Copilot CLI Invocation

```bash
devcontainer exec \
  --workspace-folder "$RALPH_REPO" \
  --config "$RALPH_REPO/.ralph/devcontainer.json" \
  --remote-env "GH_TOKEN=$GH_TOKEN" \
  --remote-env "ADO_PAT_DOCS=$ADO_PAT_DOCS" \
  --remote-env "ADO_MCP_AUTH_TOKEN=$ADO_PAT_DOCS" \
  --remote-env "ADO_PAT_XPERIENCE=$ADO_PAT_XPERIENCE" \
  -- copilot --agent ralph --experimental --yolo \
     -p "$PROMPT"
```

### Timeout

30-minute max per task. If exceeded, kill the process, mark as `partial`, comment on JIRA.

---

## Error Handling

| Scenario | Action |
|---|---|
| JIRA API failure | Log error, retry next poll cycle |
| Container start failure | Log error, re-enqueue issue, comment on JIRA |
| Copilot CLI timeout | Kill process, collect partial logs, comment on JIRA |
| Copilot CLI error exit | Collect logs/handoff if present, comment on JIRA |
| Container stop failure | Force kill, log warning |
| Network failure mid-execution | Copilot CLI handles this internally |

---

## Security Notes

- `.env` is gitignored — secrets never committed
- PATs are passed via `--remote-env` at exec time, never baked into images
- JIRA API token has minimal scope (read issues, add comments, transition)
- ADO PATs are scoped to Code (Read & Write) only
- All container execution uses the devcontainer spec's security model
