# Role Patterns

Use these patterns to wire different kinds of subagents correctly.

## Researcher / Scout / Analyst

Typical shape:

- reads repo context and upstream issue/task data
- writes structured findings
- returns `researched`, `scouted`, `analyzed`, or `blocked`

Common orchestrator updates:

- predecessor dispatch row points to the new research-like agent
- route from its success result to the next phase owner
- blocked/failure behavior added to error handling

Common sibling updates:

- writer or verdict/reviewer prompt reads the new output artifact

## Writer / Coder / Implementer

Typical shape:

- reads research or prior review artifacts
- writes implementation summary plus changed files in the repo
- returns `implemented` or `partial`

Common orchestrator updates:

- route to downstream reviewers or commit phase
- retry-loop integration if reviewers can reject

Common sibling updates:

- reviewers read the writer output artifact
- orchestrator updates any statement saying it does implementation itself

## Reviewer

Typical shape:

- reads changed files and relevant upstream artifacts
- writes findings
- returns `approved` or `needs-revision`

Common orchestrator updates:

- add reviewer row to the roster
- add reviewer rows to routing rules
- update review gate text
- update loop rules and iteration cap

Common sibling updates:

- writer reads reviewer outputs on later iterations
- scribe includes reviewer verdicts/findings in handoff output

## Validator / Helper

Typical shape:

- called by another subagent, not by the orchestrator
- validates a narrow artifact or subtask
- returns helper-specific statuses

Common updates:

- parent subagent prompt explains when to call it
- parent subagent reads its output and reacts accordingly
- orchestrator usually does not change

## Scribe / Aggregator

Typical shape:

- reads all upstream status and output artifacts
- writes handoff output
- returns `composed` or `partial`

Common orchestrator updates:

- route to scribe after the last phase owner
- handoff and delivery steps now depend on scribe artifacts
- remove any inline handoff composition logic from the orchestrator

Common sibling updates:

- ensure every upstream agent writes enough artifact detail for aggregation

## Specialist Domain Agent

Typical shape:

- owns one narrow but repeated kind of work, for example IA review, security review, migration analysis, or release-note drafting

Common updates:

- add role-specific skills to its prompt
- update the orchestrator's ownership language so the specialization is visible
- audit whether the existing generalist agent should still exist or shrink