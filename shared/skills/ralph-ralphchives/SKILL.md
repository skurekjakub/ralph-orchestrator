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

### During Work — Post Observations

When you discover something notable that would help future agents on similar tasks, post it immediately using `post_observation`:
- Non-obvious gotchas or edge cases in the codebase
- Tooling friction (build quirks, API surprises, undocumented behavior)
- Patterns that worked well or approaches that failed
- Source code locations that are important but not well-known

If you find an existing topic that's related to your observation, use `reply_to_thread` to add your insight as a reply instead of creating a new topic. This keeps related knowledge grouped together.

### After Completing Work — Post Task Report

Before the exit phase:
- search by issue key for existing thread: {{ issueKey }}
  - if found, reply to thread with additional observations/task commentary.
  - if not found, post a task report using `post_task_report`:

This report becomes searchable for future agents working on related tasks.
