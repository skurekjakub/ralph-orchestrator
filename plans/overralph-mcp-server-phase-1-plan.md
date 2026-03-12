# OverRalph MCP Server — Phase 1 Implementation Plan

A concrete implementation plan for the first version of the OverRalph MCP server, focused on a stable registry-backed tool surface and a direct integration with the existing Agent Factory.

## Phase 1 Goal

Deliver a custom MCP server that lets OverRalph:
- create a new governed Ralph agent family through the existing Agent Factory
- list created agents
- inspect agent metadata
- run a created agent by registry ID
- refine an existing agent

Phase 1 deliberately does **not** expose each created agent as a new top-level MCP tool. Instead, it uses a stable registry-backed tool surface.

## Why this Phase 1 shape

This phase should optimize for:
- compatibility with MCP clients
- stable tool inventory
- easy observability and audit
- straightforward integration with the already-existing Agent Factory
- minimal coupling to future promotion/dynamic-tool logic

This avoids premature complexity around runtime tool-list mutation while still delivering the core capability OverRalph needs.

---

## Phase 1 Scope

## Included

- New custom MCP server: `overralph-factory`
- Persistent agent registry
- Tool handlers for:
  - `factory_create_agent`
  - `factory_list_agents`
  - `factory_get_agent`
  - `factory_run_agent`
  - `factory_refine_agent`
- Host-side execution wrapper for invoking the existing Agent Factory and generated agent families
- Structured registry metadata for created agents
- Structured run records for executions

## Explicitly deferred to later phases

- True dynamic top-level MCP tool registration per generated agent
- Tool-list-changed notifications
- Promotion/archival lifecycle
- Multi-tenant policy registries
- Parallel run scheduling and quotas
- Deep cost accounting and optimization

---

## High-Level Architecture

```text
OverRalph
  -> MCP: overralph-factory
       -> registry store
       -> policy-profile resolution
       -> Agent Factory runner
       -> generated-agent runner
       -> run ledger
```

### Core design choice

The MCP surface remains fixed. Created Ralphs become **registry entries**, not immediate top-level tools.

That means the server always exposes the same small set of tools, while the agent library behind it grows dynamically.

---

## MCP Surface for Phase 1

## 1. `factory_create_agent`

Creates a new agent family through the existing Agent Factory.

### Input

```json
{
  "description": "Create an implementation agent for backend tasks in the Payments epic.",
  "policyProfile": "feature-delivery-high-assurance",
  "outputPath": ".overralph/agents",
  "exposure": "registry-only"
}
```

### Output

```json
{
  "status": "created",
  "agentId": "agent://payments-backend-implementer",
  "name": "payments-backend-implementer",
  "outputPath": ".overralph/agents/payments-backend-implementer",
  "policyProfile": "feature-delivery-high-assurance",
  "registryState": "ready"
}
```

## 2. `factory_list_agents`

Lists all agents in the registry.

### Output

```json
{
  "agents": [
    {
      "agentId": "agent://payments-backend-implementer",
      "name": "payments-backend-implementer",
      "policyProfile": "feature-delivery-high-assurance",
      "status": "ready",
      "version": 1
    }
  ]
}
```

## 3. `factory_get_agent`

Returns metadata and manifest data for one agent.

### Input

```json
{
  "agentId": "agent://payments-backend-implementer"
}
```

## 4. `factory_run_agent`

Runs a created agent family by registry ID.

### Input

```json
{
  "agentId": "agent://payments-backend-implementer",
  "prompt": "Implement task PAY-123 backend changes on the current feature branch.",
  "artifactRoot": ".overralph/runs/run-001/payments-backend-implementer",
  "contextFiles": ["plans/payments-epic.md"],
  "taskRef": "PAY-123"
}
```

### Output

```json
{
  "status": "completed",
  "result": "implemented",
  "summary": "Implemented PAY-123 backend changes and opened PR.",
  "artifacts": [
    ".overralph/runs/run-001/payments-backend-implementer/output.md"
  ],
  "taskPacket": {
    "taskRef": "PAY-123",
    "branch": "feature/pay-123-backend",
    "prUrl": "https://ado/...",
    "reviewState": "pending"
  }
}
```

## 5. `factory_refine_agent`

Invokes the refinement path for an existing created agent.

### Input

```json
{
  "agentId": "agent://payments-backend-implementer",
  "findings": "The reviewer rejected two recent runs because the agent omitted required tests.",
  "policyProfile": "feature-delivery-high-assurance"
}
```

---

## Integration with the Existing Agent Factory

The existing Agent Factory already supports an output path override. Phase 1 should use that directly.

## The key assumption

Yes: `factory_create_agent` should invoke the Agent Factory with a specified output path.

### Recommended output convention

Use this default base path for generated agents:

```text
.overralph/agents/
```

Each created family gets its own directory:

```text
.overralph/agents/<slug>/
```

Example:

```text
.overralph/agents/payments-backend-implementer/
  agent.md or *.agent.md files
  agent.manifest.json
  registry-metadata.json
```

This keeps generated agent families separate from:
- `.github/agents/` for human-curated editor agents
- `profiles/*/agents/` for Ralph Orchestrator profile-owned agents

## How `factory_create_agent` should work

1. Receive MCP tool call
2. Resolve or validate `policyProfile`
3. Derive agent slug from the description
4. Compute output path:
   - explicit `outputPath` if provided
   - otherwise `.overralph/agents/<slug>`
5. Create a factory run directory:
   - `.overralph/factory-runs/<request-id>/`
6. Invoke the existing Agent Factory with:
   - original description
   - `--output <computed-output-path>`
   - policy profile handle in the prompt/request
7. Wait for completion
8. Inspect factory outputs and generated files
9. Build a registry entry
10. Return created agent metadata

### Important Phase 1 constraint

The Agent Factory remains the system that generates agent families. The MCP server is only:
- a request adapter
- a runner
- a registry manager

It should not reimplement architect/builder/auditor logic.

---

## Proposed Runtime Contract Between MCP Server and Agent Factory

Phase 1 should avoid magic and make the handoff explicit.

## Factory request shape

Internally, the MCP server should generate a normalized request object:

```json
{
  "requestId": "factory-run-20260310-001",
  "description": "Create an implementation agent for backend tasks in the Payments epic.",
  "policyProfile": "feature-delivery-high-assurance",
  "outputPath": ".overralph/agents/payments-backend-implementer",
  "exposure": "registry-only"
}
```

This request should be:
- logged to disk before invocation
- included in the prompt or context passed to the Agent Factory
- referenced again when constructing the registry entry

---

## Agent Registry Design

Phase 1 needs a durable registry to support list/get/run operations.

## Registry location

```text
.overralph/registry/agents.json
```

For easier debugging, also keep one file per agent:

```text
.overralph/registry/agents/<slug>.json
```

## Registry entry shape

```json
{
  "agentId": "agent://payments-backend-implementer",
  "name": "payments-backend-implementer",
  "slug": "payments-backend-implementer",
  "description": "Implementation agent for backend tasks in the Payments epic.",
  "policyProfile": "feature-delivery-high-assurance",
  "outputPath": ".overralph/agents/payments-backend-implementer",
  "factoryRunId": "factory-run-20260310-001",
  "status": "ready",
  "version": 1,
  "createdAt": "2026-03-10T12:00:00Z",
  "updatedAt": "2026-03-10T12:00:00Z",
  "entryAgent": "agent-factory",
  "manifestPath": ".overralph/agents/payments-backend-implementer/agent.manifest.json"
}
```

## Registry status values

Use a fixed enum in implementation:
- `creating`
- `ready`
- `refining`
- `archived`
- `error`

---

## Run Ledger Design

Phase 1 also needs a simple run ledger for observability and debugging.

## Run ledger location

```text
.overralph/runs/index.json
```

Per-run records:

```text
.overralph/runs/<run-id>/metadata.json
.overralph/runs/<run-id>/result.json
.overralph/runs/<run-id>/logs/
```

## Why this matters

OverRalph will be long-running. It cannot depend on prompt context alone. The MCP server should provide durable run records from day one.

---

## Server Implementation Shape in This Repo

## New MCP server directory

```text
shared/mcp-servers/overralph-factory/
```

## Expected file layout

```text
shared/mcp-servers/overralph-factory/
  mcp-server.json
  package.json
  tsconfig.json
  src/
    index.ts
    server.ts
    config.ts
    tool-schemas.ts
    registry/
      registry-store.ts
      registry-types.ts
    runs/
      run-store.ts
      run-types.ts
    tools/
      create-agent.ts
      list-agents.ts
      get-agent.ts
      run-agent.ts
      refine-agent.ts
    execution/
      factory-runner.ts
      agent-runner.ts
      cli-runner.ts
      result-parser.ts
    policy/
      policy-resolver.ts
      policy-types.ts
  tests/
```

## Manifest shape

Phase 1 should follow the existing custom-server pattern in this repo.

Example target shape:

```json
{
  "name": "overralph-factory",
  "description": "OverRalph factory MCP — create, inspect, run, and refine generated Ralph agents.",
  "type": "custom",
  "command": "node",
  "args": ["dist/bundle.js"],
  "containerPath": "/opt/mcp/servers/overralph-factory",
  "sidecarPort": 9110,
  "requiredEnv": [],
  "tools": [
    "factory_create_agent",
    "factory_list_agents",
    "factory_get_agent",
    "factory_run_agent",
    "factory_refine_agent"
  ],
  "requiredConfig": []
}
```

Sidecar/container concerns are not the focus for this phase, but the manifest should still fit the repo's existing MCP conventions.

---

## Execution Strategy for Phase 1

There are two possible implementation paths for how the MCP server invokes the Agent Factory and generated agents.

## Option A: Direct CLI wrapper inside the MCP server

The server shells out directly to the selected LLM CLI.

### Advantages
- smallest amount of plumbing
- fastest path to first working end-to-end flow
- keeps Phase 1 isolated

### Disadvantages
- duplicates some execution concepts already present in Ralph Orchestrator
- future reuse with orchestrator code may require refactoring

## Option B: Reuse or extract existing local execution primitives

The MCP server reuses host-side runner logic already conceptually present in local stages.

### Advantages
- better long-term architecture
- less duplication
- easier convergence between OverRalph and Ralph Orchestrator execution paths

### Disadvantages
- more up-front refactoring
- larger Phase 1 scope

## Recommendation

For Phase 1, use **Option A with a clean boundary**, but structure it so extraction is easy later.

That means:
- put all CLI invocation logic behind `cli-runner.ts`
- put all result parsing behind `result-parser.ts`
- put Agent Factory specific invocation in `factory-runner.ts`
- put generated-agent invocation in `agent-runner.ts`

This keeps the first version achievable without locking in a mess.

---

## How `factory_create_agent` Invokes Agent Factory

Phase 1 should treat Agent Factory as an existing autonomous worker.

## Invocation flow

1. Build request prompt/context for Agent Factory
2. Include:
   - capability description
   - output path
   - policy profile handle
   - exposure mode
3. Invoke Agent Factory through `factory-runner.ts`
4. Wait for completion packet / parse result
5. Validate expected outputs exist at the output path
6. Write registry entry

## Example prompt skeleton

```text
Create an agent family with this capability:
{description}

Policy profile:
{policyProfile}

Output path:
{outputPath}

This family is intended for OverRalph registry-backed execution.
Produce a complete agent family at the specified output path.
```

This is enough for Phase 1. The important part is that the output path is explicit and controlled by the MCP server.

---

## How `factory_run_agent` Works

`factory_run_agent` should not know anything about the family beyond its registry entry and manifest.

## Run flow

1. Resolve `agentId` in the registry
2. Verify registry state is `ready`
3. Load manifest metadata
4. Prepare run directory under `.overralph/runs/<run-id>/`
5. Invoke the generated agent via `agent-runner.ts`
6. Parse structured result
7. Write run ledger records
8. Return a normalized MCP response

## Response normalization

Even if individual generated families vary internally, the MCP server should normalize outputs into a consistent response packet.

That normalized packet is what OverRalph consumes.

---

## Policy Integration in Phase 1

Phase 1 should keep policy resolution intentionally light.

## Minimum viable policy handling

- accept `policyProfile` as an input to `factory_create_agent`
- pass it to Agent Factory as a handle
- stamp the resulting registry entry with it
- require it again on `factory_refine_agent` only if needed

## Explicitly deferred

- policy bundle resolution inside the MCP server
- runtime validation of policy artifact presence
- profile-to-skill/template expansion inside the server

That logic belongs primarily in the Agent Factory and its future policy resolver. Phase 1 should not duplicate it.

---

## Testing Plan

Phase 1 needs tests at three levels.

## 1. Unit tests

- registry store read/write
- run store read/write
- schema validation
- result normalization
- slug and path derivation

## 2. Tool handler tests

- `factory_create_agent` with mocked runner
- `factory_list_agents`
- `factory_get_agent`
- `factory_run_agent` with mocked execution result
- `factory_refine_agent` with mocked runner

## 3. Integration tests

- create -> registry entry exists
- create -> list returns created agent
- create -> get returns metadata
- run -> run record created and normalized result returned
- refine -> registry metadata updates as expected

The first implementation can mock the CLI runner heavily; full end-to-end live CLI tests can come later.

---

## Implementation Sequence

## Step 1: Create server skeleton

Create the new custom MCP server directory and baseline package/manifests.

Deliverables:
- `mcp-server.json`
- package scaffold
- server bootstrap

## Step 2: Add registry and run stores

Implement persistent JSON-backed stores for:
- agent registry
- run ledger

Deliverables:
- registry types and store
- run types and store
- tests

## Step 3: Add stable tool handlers

Implement the five Phase 1 tools with schemas and stubbed runners.

Deliverables:
- tool schemas
- handler wiring
- handler tests

## Step 4: Implement CLI execution boundary

Add the isolated execution layer:
- `cli-runner.ts`
- `factory-runner.ts`
- `agent-runner.ts`
- `result-parser.ts`

Deliverables:
- runner interfaces
- mocked tests
- error mapping

## Step 5: Wire `factory_create_agent` to Agent Factory

Use the real Agent Factory prompt/entrypoint and pass explicit output path.

Deliverables:
- real create flow
- registry write on success
- error state on failure

## Step 6: Wire `factory_run_agent`

Use registry entry + manifest to execute created families and write run records.

Deliverables:
- real run flow
- normalized response packets
- ledger write

## Step 7: Wire `factory_refine_agent`

Add refinement path using the existing refinement workflow.

Deliverables:
- refine handler
- registry update
- refinement tests

---

## Risks and Mitigations

## Risk 1: Agent Factory output shape is too implicit

### Mitigation
Add a minimal generated-family manifest contract early, even if handcrafted in Phase 1.

## Risk 2: CLI invocation behavior is brittle

### Mitigation
Keep all CLI interaction behind one isolated runner boundary and mock it thoroughly in tests.

## Risk 3: Generated agents are mixed with human-authored agents

### Mitigation
Keep all generated families under `.overralph/agents/`, not `.github/agents/`.

## Risk 4: Policy concerns leak into OverRalph-facing tool inputs

### Mitigation
Allow only a profile handle, never explicit skills/templates/fragments.

## Risk 5: Registry drift from filesystem reality

### Mitigation
On `list` and `get`, tolerate verification checks and mark entries as `error` if key files disappear.

---

## Phase 1 Exit Criteria

Phase 1 is complete when:
- the new `overralph-factory` MCP server exists as a custom server in `shared/mcp-servers/`
- `factory_create_agent` can create a new family by invoking the existing Agent Factory with an explicit output path
- created families are persisted in a registry
- `factory_list_agents` and `factory_get_agent` work against that registry
- `factory_run_agent` can execute a created family and return a normalized packet
- `factory_refine_agent` can invoke the refinement path for an existing family
- tests cover registry behavior and tool handlers
- no dynamic top-level tool registration is required yet

---

## Summary

Phase 1 should be a **stable registry-backed MCP server** that wraps the existing Agent Factory rather than replacing it.

The key integration is straightforward:
- `factory_create_agent` calls the Agent Factory
- it passes a controlled output path under `.overralph/agents/`
- it records the result in a durable registry
- all later interactions (`list`, `get`, `run`, `refine`) operate through that registry

This gives OverRalph the control surface it needs without yet taking on the complexity of true dynamic MCP tool registration.