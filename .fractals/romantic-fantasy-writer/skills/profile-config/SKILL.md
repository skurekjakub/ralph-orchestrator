# Profile Configuration — Romantic Fantasy Writer

## Purpose

The `profile.json` file is the deployment manifest for the romantic-fantasy-writer agent family. It declares all 67 agents, their hierarchy, prompt file locations, convergence bounds, and skill dependencies. This skill documents how to read, modify, and extend the profile.

## Structure

```json
{
  "name": "romantic-fantasy-writer",
  "version": "1.0.0",
  "description": "...",
  "domain": "romantic-fantasy",
  "entryPoint": "romantic-fantasy-writer-guide",
  "orchestrator": "romantic-fantasy-writer",
  "agentCount": 67,
  "hierarchy": { ... },
  "convergenceBounds": { ... },
  "phases": ["concept", "worldbuilding", ...],
  "crossCuttingAgents": ["continuity-tracker", ...],
  "artifactDirectory": ".romantic-fantasy-writer",
  "skills": [ ... ],
  "agents": [ ... ]
}
```

## Key Fields

### `entryPoint`
The agent that receives the initial user invocation. For this system it's `romantic-fantasy-writer-guide`, which gathers story parameters and launches the orchestrator.

### `orchestrator`
The top-level routing agent. Dispatches all 9 phase coordinators and 3 cross-cutting agents.

### `hierarchy`
Breakdown by agent level:
- **guide** (1): User-facing entry point
- **orchestrator** (1): Phase router
- **coordinators** (9): One per creative phase
- **sub-coordinators** (10): Split complex phases into sub-tasks
- **specialists** (46): Perform creative work, auditing, editing, beta reading

### `convergenceBounds`
Global limits that prevent infinite loops:
- `maxAuditorRetries: 3` — Each auditor gate allows 3 retries
- `maxRevisionBetaCycles: 2` — Revision↔beta loop runs at most twice
- `maxChaptersBeforeCheckpoint: 5` — Continuity checkpoint every 5 chapters

### `phases`
Ordered list of the 9 creative phases. The orchestrator dispatches coordinators in this order.

### `crossCuttingAgents`
Agents dispatched outside the normal phase sequence by the orchestrator at specific trigger points.

### `agents` Array
Each entry:
```json
{
  "name": "romantic-fantasy-writer-geography-builder",
  "level": "specialist",
  "parent": "romantic-fantasy-writer-physical-world-coordinator",
  "promptFile": "agents/romantic-fantasy-writer-geography-builder.agent.md"
}
```

- `name`: Fully qualified agent name (always prefixed `romantic-fantasy-writer-`)
- `level`: One of guide, orchestrator, coordinator, sub-coordinator, specialist
- `parent`: The agent that dispatches this one
- `promptFile`: Path to the agent's prompt file relative to the profile root

## Adding a New Agent

If you need to add an agent:
1. Create the `.agent.md` prompt file in `agents/`
2. Add an entry to `profile.json.agents` with name, level, parent, promptFile
3. Update `profile.json.agentCount`
4. Update the parent's routing table in the prompt to dispatch the new agent
5. Update `profile.json.hierarchy` counts
6. Add the agent to `bootstrap.sh`'s AGENTS array

## Skill References

The `skills` section maps skill directories to descriptions, allowing deployment tools to mount skill files into agent containers:

```json
{
  "name": "fractal-coordinator-patterns",
  "path": "skills/fractal-coordinator-patterns/SKILL.md",
  "description": "Coordinator routing patterns for the creative pipeline"
}
```

Skills are referenced by agent prompts as `Read skills/fractal-coordinator-patterns/SKILL.md` directives.
