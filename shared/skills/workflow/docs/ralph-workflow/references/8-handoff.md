{%- unless isRevision %}
# Phase 8: Handoff, Report & Exit

## Before you begin

1. **Read `state.md`** at `.ralph/tasks/{{ taskId }}/state.md`
2. **Verify the current phase** — this skill is for Phase 8. If `state.md` shows a different current phase, update it now.
3. **Review completed phases** — confirm all prior phases are done. Check "Tracked Identifiers" for PR URL.

## Instructions
{%- if triggerParams.release_notes %}

{% section "release-notes" %}
### 0. Release Notes

This task involves release notes.

1. Check the writer's `status.json` summary for confirmation that release notes were produced.
2. If the summary does not mention release notes, record that gap in `state.md` for the scribe and proceed with the task status that reflects the missing artifact.
{% endsection %}
{%- endif %}

### 1. Dispatch ralph-scribe

Dispatch the `ralph-scribe` sub-agent with a one-line directive (e.g. "Compose and deliver handoff artifacts for {{ taskId }}"). **Keep the dispatch prompt lean** — provide only the task ID and directive. Do NOT include inline summaries of phase outcomes, review results, or other upstream data. The scribe reads all upstream artifacts from the artifact directory directly, composes the artifacts, attaches evidence, posts the JIRA completion comment, and updates ralphchives.

- `{{ artifactDir }}/ralph-scribe/handoff.md`
- `{{ artifactDir }}/ralph-scribe/jira-comment.md`
- `{{ artifactDir }}/ralph-scribe/ralphchives-report.md`
- `/tmp/mcp-attachments/handoff-{{ taskId }}.md`

After the scribe completes, read only its `status.json`.

- `result: delivered` — proceed to your result.
- `result: partial` — proceed to your result, but use `partial` status and carry the scribe `summary` into `state.md`.

### 2. Exit

End the run with your result, as `<result-contract>` describes, even on failure:

- `STATUS`: `completed`, `partial` or `blocked`
- `JIRA_KEY`: `{{ taskId }}`
- `BRANCH`: `ralph/{{ taskId }}-<short-slug>`
- `PR_URL`: the full ADO PR URL; leave it out if PR creation failed
- `HANDOFF`: `/tmp/mcp-attachments/handoff-{{ taskId }}.md`
- `SUMMARY`: one line on what was done
{%- else %}
<!-- This file is for the standard workflow. You are running a revision workflow — this file is intentionally empty. -->
{%- endunless %}
