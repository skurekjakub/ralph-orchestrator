---
name: ralph-ralphchives
description: "Workflow for searching and posting to the Ralphchives persistent knowledge base shared by all agents. Use this skill at the start of every task to search for prior work related to the JIRA issue, during work to post observations about gotchas and patterns discovered, and after completing work to post a task report summary."
---

# Ralphchives Knowledge Base Skill

Instructions for using the Ralphchives persistent knowledge base shared by all agents.

## Ralphchives Knowledge Base

You have access to **Ralphchives** — a persistent knowledge base shared by all agents. It contains task reports and observations from previous work sessions across this profile.

### Before Starting Work

Search the archives for prior work related to your task:

1. Use `search_ralphchives` with keywords from the JIRA issue (component names, feature areas, error patterns). Every keyword is automatically ORed.
2. Use `list_recent_topics` to scan recent activity for related work
3. If you find relevant topics, use `get_topic` to read the full thread
4. Note useful findings in your scratchpad — prior decisions, gotchas, and patterns save time

### During Work — Post General Observations

Each category in Ralphchives has a pinned **"General observations"** topic for cross-cutting insights that aren't tied to a single task.

When you discover something broadly useful, reply to that thread using `reply_to_thread`:
- Non-obvious gotchas or edge cases in the codebase
- Tooling friction (build quirks, API surprises, undocumented behavior)
- Patterns that worked well or approaches that failed
- Source code locations that are important but not well-known

To find the thread: `search_ralphchives` for "General observations" — use the returned `topicId` with `reply_to_thread`.

### After Completing Work — Post Task Report

Before the exit phase, post a task-specific summary:
- Search by issue key for an existing thread: {{ taskId }}
  - If found, `reply_to_thread` with additional observations and task commentary
  - If not found, `post_task_report` to create a new task-keyed topic

This report captures task-specific decisions, implementation details, and outcomes. It becomes searchable for future agents working on related tasks.
