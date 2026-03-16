# Container Deployment Pattern — Romantic Fantasy Writer

## Purpose

Defines how the 67 agents in the romantic-fantasy-writer system are packaged for deployment. Each agent runs in an isolated container with its prompt file, skill mounts, and artifact volume. This skill documents the container topology and deployment patterns.

## Container Architecture

### One Container Per Agent Level
Rather than 67 individual containers, agents are grouped by operational role:

| Container | Agents | Skills Mounted |
|-----------|--------|----------------|
| `rfw-guide` | guide (1) | rules, prompt-security |
| `rfw-orchestrator` | orchestrator (1) | rules, fractal-orchestrator-architecture, agent-as-function-contract |
| `rfw-coordinators` | 9 coordinators + 10 sub-coordinators | rules, fractal-coordinator-patterns, agent-as-function-contract |
| `rfw-creative-specialists` | 26 creative writers (builders, drafters, editors) | rules, agent-as-function-contract |
| `rfw-auditors` | 9 auditors | rules, agent-as-function-contract, prompt-security |
| `rfw-beta-readers` | 5 beta readers + synthesizer | rules, agent-as-function-contract |
| `rfw-cross-cutting` | 3 cross-cutting agents | rules, agent-as-function-contract |

### Volume Mounts

All containers share a single artifact volume:
```
volumes:
  - .romantic-fantasy-writer:/artifacts
```

The artifact directory is the communication bus. Each container reads its inputs and writes its outputs to paths within this volume.

### Prompt File Mount

Each container mounts the `agents/` directory read-only:
```
volumes:
  - ./agents:/prompts:ro
```

The agent prompt file is specified via environment variable:
```
environment:
  - AGENT_PROMPT=/prompts/romantic-fantasy-writer-geography-builder.agent.md
```

### Skill Mounts

Skills are mounted read-only into each container:
```
volumes:
  - ./skills:/skills:ro
```

Agents reference skills as `Read /skills/fractal-coordinator-patterns/SKILL.md` in their prompts.

## Deployment Topology

### Development (Single Machine)
All containers run on the same host. The artifact volume is a local directory. Agents are invoked sequentially by the orchestrator.

```
docker-compose up rfw-guide
# Guide gathers user input, launches orchestrator
# Orchestrator dispatches coordinators sequentially
# Each coordinator dispatches specialists
```

### Production (Distributed)
Artifact volume is a shared NFS/S3 mount. Containers can run on different hosts. The orchestrator polls for status.json files via filesystem watches or periodic checks.

## Environment Variables

| Variable | Purpose | Example |
|----------|---------|---------|
| `AGENT_PROMPT` | Path to agent prompt file | `/prompts/romantic-fantasy-writer-geography-builder.agent.md` |
| `ARTIFACT_DIR` | Root artifact directory | `/artifacts` |
| `STORY_ID` | Current story identifier | `book-1` |
| `SERIES_ID` | Series identifier (optional) | `crimson-court-trilogy` |

## Resource Allocation

Creative writing agents are compute-intensive (large context windows for chapter drafting). Recommended allocations:

| Agent Type | Memory | Context Window |
|-----------|--------|----------------|
| Guide, Orchestrator | Low | Small (routing only) |
| Coordinators | Low | Small (routing only) |
| Chapter drafter | High | Large (needs full outline + style guide + continuity) |
| Beta readers | Medium | Medium (needs chapter + specific lens criteria) |
| Auditors | Medium | Medium (needs phase artifacts + invariant checklist) |

## Health Checks

Each container should implement a health check that verifies:
1. Agent prompt file is readable
2. Artifact directory is writable
3. Skill files are readable
