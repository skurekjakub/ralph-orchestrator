# Policy Layer and Agent Factory

A design for the governed substrate that constrains generated Ralph agent families and a comparison of the main ways the Agent Factory can consume that substrate.

## Goal

The policy layer exists to ensure that factory-generated agents do not merely produce a working outcome, but produce one that satisfies durable assumptions about quality, workflow, safety, and reviewability.

The policy layer is **not** a prompt pasted into OverRalph. It is a governed substrate consumed by the Agent Factory and enforced by the factory's architect, builder, and auditor stages.

## Core Boundary

### OverRalph

OverRalph works at the level of:
- epics
- tasks and subtasks
- JIRA state
- PR state
- task completion packets
- merge readiness

OverRalph should not know about:
- individual reference skills
- style guide files
- approved prompt fragments
- exact workflow template files
- result-code schemas
- rubric files

At most, OverRalph should select a **policy profile handle** such as:
- `docs-strict`
- `feature-delivery-high-assurance`
- `security-review`
- `fast-exploratory`

### Agent Factory

The Agent Factory is the policy consumer. It is responsible for:
- resolving a policy profile to concrete artifacts
- constraining architecture generation to approved patterns
- constraining skill mounting to approved skills
- constraining result codes to approved schemas
- enforcing validation rules through the auditor

This keeps OverRalph thin and keeps policy enforcement close to the component that actually creates agents.

---

## What the Policy Layer Contains

The policy layer is a curated, versioned substrate assembled asynchronously by humans.

## Policy Substrate Contents

| Artifact class | Purpose |
|---|---|
| Reference skills | Durable operational and domain knowledge agents are allowed to use |
| Style guides | Output quality constraints for docs, code, PR descriptions, handoff comments |
| Workflow templates | Approved orchestration shapes and phase flows |
| Domain checklists | Required checks for specific domains such as docs, security, API changes, migrations |
| Evaluation rubrics | How agent outputs are graded and what counts as passing |
| Approved prompt fragments | Reusable prompt sections such as artifact contracts, review gates, safety rules |
| Result-code schemas | Fixed allowed result shapes for orchestrators and subagents |
| Validation rules | Auditor rules that decide whether a generated family is compliant |

## Policy Outcomes

The policy layer is how the system ensures:
- output quality bar
- review and validation requirements
- stable result code shapes
- reproducible workflows
- bounded creativity by generated agents

---

## Policy Profile Model

The cleanest abstraction is a **policy profile**: a named bundle of approved artifacts.

Example:

```json
{
  "name": "feature-delivery-high-assurance",
  "version": "2026-03-10",
  "description": "Strict policy for code-delivery agent families that must end in reviewed, merge-ready PRs.",
  "referenceSkills": [
    "agent-as-function",
    "feature-implementation-workflow",
    "agent-as-function-audit"
  ],
  "styleGuides": [
    "engineering-style-v1",
    "pr-description-standard-v2"
  ],
  "workflowTemplates": [
    "research-plan-implement-review-deliver",
    "revision-loop-3max"
  ],
  "domainChecklists": [
    "build-and-test-required",
    "migration-risk-checklist"
  ],
  "evaluationRubrics": [
    "feature-delivery-rubric-v3"
  ],
  "promptFragments": [
    "pure-router-rules",
    "artifact-contract",
    "review-gate",
    "handoff-standard"
  ],
  "resultCodeSchemas": [
    "orchestrator-standard-v1",
    "reviewer-standard-v1"
  ],
  "validationRules": [
    "no-output-read-by-orchestrator",
    "all-results-routed",
    "approved-skills-only"
  ]
}
```

A generated agent family is then not "free-form". It is "compiled against policy profile X".

---

## Agent Factory Consumption Points

The policy layer should be consumed at three points inside the factory.

## 1. Architect stage

The architect uses the policy profile to constrain design.

### Architect consumes
- approved workflow templates
- approved prompt fragments
- approved result-code schemas
- approved reference skills
- quality and review requirements

### Architect decisions constrained by policy
- which orchestration patterns are allowed
- which phase sequences are allowed
- which result codes are valid
- what review gates must exist
- which quality checks are mandatory
- whether parallel review or revision loops are required

The architect should not invent patterns outside the selected policy unless explicitly allowed.

## 2. Builder stage

The builder uses the policy profile to constrain implementation.

### Builder consumes
- approved prompt fragments
- approved skill list
- approved template shapes
- approved output/report structures

### Builder decisions constrained by policy
- which skills may be mounted
- which prompt sections must be included
- which template fragments may be composed
- where workflow tables and review gates come from
- how artifacts and status files are shaped

The builder should be composing from approved building blocks, not generating arbitrary prompt text from scratch.

## 3. Auditor stage

The auditor uses the policy profile as the compliance source of truth.

### Auditor consumes
- validation rules
- evaluation rubrics
- result-code schemas
- approved skill list
- approved workflow patterns

### Auditor checks
- only approved skills were mounted
- only approved workflow patterns were used
- emitted result codes match known schemas
- required gates and checks exist
- prohibited prompt structures were not introduced
- generated family meets the policy's quality bar

This is the enforcement point that makes the whole model real.

---

## Consumption and Integration Options

There are several viable ways to integrate the policy layer with the factory.

## Option A: Compile-time embedding

The factory copies policy artifacts directly into generated agent files at creation time.

### How it works
- Architect resolves the policy profile
- Builder embeds approved fragments into generated prompts and skills
- Generated files are self-contained

### Advantages
- simplest runtime model
- generated agents are portable
- minimal dependency on a separate policy runtime

### Disadvantages
- policy changes do not automatically affect existing agents
- policy drift appears quickly across generations
- hard to know which generated family used which exact policy version unless explicitly stamped

### Best use
- when portability matters more than central governance
- for smaller or semi-static agent ecosystems

## Option B: Policy profile reference in manifest

Generated agents carry a policy profile reference and resolve parts of the policy at runtime or execution-prep time.

### How it works
- Factory emits agent family with metadata such as `policyProfile=feature-delivery-high-assurance@2026-03-10`
- Execution wrapper or orchestrator loads the referenced policy bundle
- Skills, fragments, and validation expectations come from that bundle

### Advantages
- cleaner version tracking
- easier to rotate policy profiles over time
- agents remain compact because policy artifacts are not fully copied

### Disadvantages
- runtime now depends on policy profile availability
- more complex execution setup
- debugging can be harder because final prompt is assembled later

### Best use
- when strong governance and traceability matter
- for long-lived agent ecosystems where policies change regularly

## Option C: Hybrid embedding plus reference

Generated agents embed critical invariants and reference the broader policy profile for softer guidance.

### Embedded permanently
- artifact contract
n- core pure-router rules
- required result-code shape
- required review gate structure

### Resolved by profile reference
- style guides
- domain checklists
- evaluation rubrics
- optional prompt fragments
- domain-specific reference skills

### Advantages
- durable core behavior
- manageable runtime flexibility
- easier migration than pure reference model

### Disadvantages
- more complex than either extreme
- requires clear separation between hard invariants and soft guidance

### Best use
- likely the best default for the Ralph ecosystem

## Option D: Mount-only policy substrate

The factory writes almost no policy into generated prompts. Instead, policy is mounted as skills, templates, and checklists when the agent runs.

### How it works
- Generated families contain mostly role logic and wiring
- Execution environment mounts approved skills and policy references based on the chosen profile

### Advantages
- central policy control
- easy to update behavior system-wide
- minimal duplication

### Disadvantages
- agents are not portable
- execution environment becomes heavily responsible for correctness
- prompt behavior can become opaque

### Best use
- containerized, centrally managed environments like Ralph Orchestrator profiles

## Option E: Audit-only policy integration

The factory generates freely and the auditor is the only hard policy enforcement point.

### How it works
- Architect and builder are relatively unconstrained
- Auditor rejects any output that violates policy

### Advantages
- flexible generation
- easier early experimentation

### Disadvantages
- inefficient because invalid families are generated first and fixed later
- policy enters too late in the pipeline
- builder churn and audit loops become expensive

### Best use
- prototyping only
- not recommended for production

---

## Recommended Model

The best overall model is **Option C for the factory** combined with **Option D for execution**.

### Recommended factory behavior
- embed hard invariants in generated prompts and manifests
- stamp each generated family with the policy profile name and version
- reference the broader policy bundle for reusable skills, guides, and rubrics
- audit against the exact resolved policy profile used during generation

### Embedded hard invariants
- pure-router contract
- artifact handoff rules
- allowed result-code family
- required validation gate structure
- required status/report packet shape

### Externalized policy artifacts
- domain reference skills
- style guides
- workflow reference files
- evaluation rubrics
- domain checklists
- approved prompt fragments beyond the hard core

This provides a stable base while keeping the ecosystem governable.

---

## How Humans Deliver Policy Asynchronously

Humans should not edit OverRalph or the generated agents directly for every policy change. Instead, they publish policy assets into a governed registry.

## Human delivery pipeline

1. Humans author or revise policy artifacts
2. Artifacts go through review and approval
3. A policy curator packages them into a versioned policy profile
4. The profile is published to the factory-consumable registry
5. New generated agent families consume the new profile version
6. Existing families either remain pinned or are scheduled for regeneration/refinement

This keeps governance asynchronous and auditable.

---

## What OverRalph Should Know

OverRalph should know only the minimum needed to request an appropriate agent family.

## Minimal OverRalph awareness

OverRalph may pass:
- target repo or system
- task/goal description
- policy profile handle
- assurance level
- delivery target, such as `ready-to-merge feature branch`

OverRalph should not pass:
- explicit skill names
- explicit template files
- explicit prompt fragments
- rubric file paths
- checklist file paths

Those are Agent Factory implementation details.

### Example request boundary

Good:

```json
{
  "description": "Create an agent family that can implement backend tasks for the Payments epic and deliver reviewed, merge-ready PRs.",
  "policyProfile": "feature-delivery-high-assurance",
  "deliveryTarget": "ready-to-merge-feature-branch"
}
```

Bad:

```json
{
  "description": "Create an implementation agent.",
  "skills": ["feature-implementation-workflow", "api-style-guide"],
  "promptFragments": ["review-gate", "artifact-contract"],
  "rubric": "feature-delivery-rubric-v3"
}
```

The second leaks policy internals into OverRalph and couples it to factory implementation details.

---

## Interaction with Epic-Level OverRalph

For epic delivery, OverRalph operates at the level of task completion packets and PR state. The policy layer shapes the lower-level workers, not OverRalph's own reasoning.

### Epic-level effect of policy

The policy profile influences:
- what kind of Ralphs the factory creates for each task class
- what review gates must exist before a PR is considered approved
- what completion packet fields are required
- what quality checks count as mandatory before merge
- what branch/PR strategies are allowed

OverRalph just sees the consequences in structured outputs:
- task ready or blocked
- PR approved or rejected
- merge permitted or not permitted
- additional review required or not required

That is the right separation.

---

## Open Design Questions

1. Should generated families pin an exact policy profile version or float to the latest approved version?
   Recommendation: pin exact version for reproducibility.

2. Should existing families be automatically re-audited when a policy profile changes?
   Recommendation: yes, but not automatically rewritten. Re-audit first, then refine intentionally.

3. Should the policy registry live in git, a database, or a dedicated MCP-backed service?
   Recommendation: start with git-backed versioned artifacts and a manifest index.

4. Should policy profile selection be explicit in every factory request or inferred from the epic/task type?
   Recommendation: support both, but prefer explicit selection for high-assurance work.

5. Should the execution runtime be allowed to add extra skills beyond policy profile resolution?
   Recommendation: only if the policy explicitly allows an extension set; default deny.

---

## Summary

The policy layer is a governed substrate consumed by the Agent Factory, not by OverRalph.

- OverRalph requests capabilities under a policy handle
- Agent Factory resolves that handle to concrete governed artifacts
- Architect and builder generate only within that bounded space
- Auditor enforces compliance against the same profile
- Execution environments mount or resolve the broader policy substrate as needed

This keeps OverRalph focused on delivery management while placing policy awareness where it belongs: inside the system that creates and validates the workers.