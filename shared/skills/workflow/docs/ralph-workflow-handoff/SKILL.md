---
name: ralph-workflow-handoff
description: "Standard workflow Phase 8 — the final phase. Read this skill when the PR is created (or attempted) and you're ready to wrap up. Covers writing the handoff document with source references, attaching it to JIRA, posting a completion comment, reporting to ralphchives, and printing the ===RALPH_RESULT_START=== exit block. The exit block is mandatory — the orchestrator cannot detect completion without it."
---

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
2. If the summary does not mention release notes, note that gap in the handoff and proceed with the task status that reflects the missing artifact.
{% endsection %}
{%- endif %}

### 1. Dispatch ralph-scribe

Dispatch the `ralph-scribe` sub-agent to compose the handoff document, JIRA completion comment, and ralphchives report. The scribe reads all upstream artifacts from the artifact directory and produces:

- `{{ artifactDir }}/ralph-scribe/handoff.md`
- `{{ artifactDir }}/ralph-scribe/jira-comment.md`
- `{{ artifactDir }}/ralph-scribe/ralphchives-report.md`

After the scribe completes, read its `status.json`. If `result` is `composed` or `partial`, proceed.

### 2. Attach handoff and evidence files

Copy the scribe's handoff to the attachment path:

```bash
cp {{ artifactDir }}/ralph-scribe/handoff.md /tmp/mcp-attachments/handoff-{{ taskId }}.md
```

Then attach **all files** in `/tmp/mcp-attachments/` to JIRA. List the directory contents and call `jira_add_attachment` for each file — this includes the handoff, any admin UI screenshots (`adminui-*.png`), and other evidence files.

```bash
ls /tmp/mcp-attachments/
```

For each file found, attach it using `jira_add_attachment` with the file name.

{%- if triggerParams.release_notes %}

{% section "release-notes" %}
### 2.5 Attach release note file

Attach to JIRA using `jira_add_attachment` and file name `release-notes.md`.
{% endsection %}
{%- endif %}


### 3. Post a completion comment

Read `{{ artifactDir }}/ralph-scribe/jira-comment.md` and post its content on **{{ taskId }}** using `jira_add_comment`.

### 4. Post to ralphchives

Read `{{ artifactDir }}/ralph-scribe/ralphchives-report.md` and post it using the **ralph-ralphchives** skill.

First search for existing threads (`search_ralphchives`) matching the issue ({{ taskId }}) and related keywords. If not found, create a new post.

### 5. Exit

Print a final summary to stdout in this **exact format** — the orchestrator parses it:

===RALPH_RESULT_START===
JIRA_KEY: {{ taskId }}
STATUS: <completed|partial|blocked>
BRANCH: ralph/{{ taskId }}-<short-slug>
PR_URL: <full ADO PR URL, or "none" if PR creation failed>
HANDOFF: /tmp/mcp-attachments/handoff-{{ taskId }}.md
SUMMARY: <one-line description of what was done>
===RALPH_RESULT_END===

Always include this block as the very last thing you print, even on failure.
