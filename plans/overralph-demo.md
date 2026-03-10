I’m going to answer this at the operating-model level: how OverRalph would manage an epic as a long-running control plane over JIRA, PRs, and structured agent outputs rather than doing work itself.

Analyzing your answers...

Yes, that’s the right abstraction.

In that model, OverRalph is not a worker and not really a classic agent orchestrator either. It is a long-running delivery manager operating on:

- epic decomposition
- task/subtask state
- structured subagent outputs
- PR status
- approval state
- merge readiness

So if you hand it a JIRA epic plus a policy/requirements substrate, the job becomes:

1. interpret the epic against the selected governed profile
2. decompose it into executable work items
3. create or reuse specialized Ralphs for the work item classes
4. dispatch those Ralphs against tasks
5. consume only their structured outputs
6. manage JIRA and ADO until the result is a ready-to-merge branch or PR set

That is much closer to a technical program manager with autonomous staff than to a single executor.

The important part is what you said: OverRalph should work at the level of created subagent outputs, not raw reasoning. I think that’s the only scalable way.

So the architecture becomes something like this.

**OverRalph responsibilities**
- read epic
- choose policy profile / requirements substrate handle
- decompose into task graph
- create JIRA stories/subtasks/links
- decide which specialized Ralph handles each task type
- watch task completion packets
- watch PR state and review approvals
- trigger follow-up work when packets indicate blockers or gaps
- decide when a branch/PR set is merge-ready

**What OverRalph should not do**
- research code itself
- author implementation directly
- inspect long raw transcripts
- manually interpret style guides or prompt fragments
- decide low-level task execution details

That all belongs below it.

The clean mental model is a 3-layer system.

**Layer 1: Governance substrate**
Human-maintained, asynchronous, durable:
- policy profile
- quality bar
- review rules
- style guides
- workflow templates
- prompt fragments
- evaluation rubric
- result-code schemas

**Layer 2: Agent Factory + Ralph families**
Constrained compiler/execution workforce:
- generates or reuses task-class agents
- binds them to the approved substrate
- audits them
- runs them against individual tasks

**Layer 3: OverRalph**
Portfolio/control plane:
- breaks an epic into work
- allocates work to agents
- manages issue graph, PR graph, merge flow
- consumes structured results only

That means if you gave OverRalph an epic like “deliver feature X,” the lifecycle could look like:

## Epic Flow

### 1. Intake
OverRalph receives:
- JIRA epic
- target repo
- policy profile
- delivery target: “ready-to-merge feature branch”

It first asks:
- what kind of work graph is this?
- backend, docs, UI, infra, mixed?
- what quality gates apply under this profile?

It does not resolve those itself from raw reference files. It asks the factory or a planning Ralph built under that substrate.

### 2. Decomposition
OverRalph creates or reuses an epic-decomposer Ralph.

That Ralph outputs a structured packet like:
- workstreams
- dependencies
- suggested task breakdown
- acceptance criteria
- required reviewer classes
- branch/PR strategy suggestion

Then OverRalph creates:
- JIRA stories
- subtasks
- dependency links
- maybe labels/components/epic links

At this level, JIRA is the work graph, not just a ticket source.

### 3. Agent allocation
For each task class, OverRalph decides:

- existing Ralph fits → use it
- no fit → ask Agent Factory to create one under the selected policy profile

Examples:
- backend implementation Ralph
- API review Ralph
- migration planner Ralph
- integration test Ralph
- release-notes Ralph

Each of those is still policy-bound by the substrate, but OverRalph only sees them as capabilities.

### 4. Execution
Each Ralph works one task or one coherent batch of tasks and emits a completion packet.

That packet should be something like:

```json
{
  "status": "completed",
  "result": "implemented",
  "summary": "Implemented backend support for feature X",
  "artifacts": [".../output.md"],
  "jira": {
    "taskKey": "DOC-4001",
    "nextSuggestedTasks": ["DOC-4002", "DOC-4003"]
  },
  "pr": {
    "branch": "feature/doc-4001-backend",
    "prUrl": "https://...",
    "reviewStatus": "pending"
  },
  "quality": {
    "checks": ["build", "tests", "review"],
    "state": "passed"
  }
}
```

This is the right unit for OverRalph to consume.

Not transcript.
Not raw logs.
Not artifact prose.

A task completion packet.

### 5. PR management
This is where your idea gets strong.

OverRalph can manage ADO as a first-class control surface:
- create or update PRs
- track review state
- trigger reviewer Ralphs
- interpret reviewer approval packets
- trigger revision tasks if rejected
- merge approved PRs if policy allows
- maintain a feature branch or stacked PR set

At that point OverRalph is effectively running a merge train for the epic.

There are two viable PR strategies.

**Strategy A: task-scoped PRs**
- one task → one branch → one PR
- OverRalph merges approved PRs into an integration branch
- best for auditability and rollback
- slower, more PR overhead

**Strategy B: workstream-scoped PRs**
- one workstream → one branch → one PR
- multiple subtasks contribute into the same branch
- fewer PRs, more integration risk
- better for tightly coupled work

I’d default to task-scoped unless dependencies are very tight.

### 6. Epic completion
OverRalph should decide epic completion from structured evidence, not intuition.

Something like:
- all required child tasks are completed
- all required PRs are approved
- all required merges have landed in the target feature branch
- no open blocker tasks remain
- validation Ralph reports green
- delivery packet says “ready-to-merge”

Then OverRalph can:
- update epic status
- post a summary comment
- attach delivery report
- mark the feature branch or integration PR as ready

## What makes this workable

The key is that OverRalph needs its own durable state, separate from conversation.

It cannot keep this in prompt context if the process takes hours or days.

It needs an external ledger for:
- epic state
- task graph
- agent assignment
- completion packets
- PR graph
- merge decisions
- blockers
- retries

So conceptually it needs its own operation ledger, just at a higher level than Ralph Orchestrator’s per-task ledger.

Something like:

- epic: `planned | active | blocked | validating | ready | done`
- task: `new | assigned | in-progress | review | revision | merged | blocked`
- pr: `open | pending-review | approved | changes-requested | merged`

That becomes OverRalph’s memory.

## Where Ralph Orchestrator fits

You said this may not necessarily involve Ralph Orchestrator, and I agree. It could be either:

**Mode 1: Direct execution**
OverRalph invokes generated Ralphs directly through an MCP execution wrapper.

**Mode 2: Delegated execution**
OverRalph creates JIRA tasks/comments to trigger Ralph Orchestrator-managed agents.

**Mode 3: Hybrid**
- direct for fast or ephemeral work
- orchestrator-bound for durable, governed, auditable work

For the epic-management scenario, hybrid is probably strongest:
- task creation / planning / tracking in OverRalph
- actual governed implementation runs through Ralph Orchestrator-backed Ralphs
- OverRalph consumes completion packets and PR state

## The big design constraint

The system only works cleanly if every lower-level agent returns structured outputs in a shape OverRalph can route on.

So I’d standardize a higher-level packet contract above plain `status.json`:
- task outcome
- branch/PR metadata
- quality gate state
- recommended next actions
- blockers

That gives OverRalph a stable interface for managing an epic.

So the short answer is:

- yes, OverRalph should operate at the level of structured subagent/task outputs
- yes, an epic-to-ready-to-merge flow is a natural fit
- yes, OverRalph becomes a JIRA/ADO control-plane manager more than an executor
- and no, it should not reason from raw artifacts; it should reason from governed completion packets and ledgers

If you want, the next useful step would be one of these:

1. define the OverRalph completion-packet schema
2. sketch the epic/task/PR state machine
3. sketch the minimal MCP/JIRA/ADO tool surface for this model