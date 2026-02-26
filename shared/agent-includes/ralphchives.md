{% if ralphchivesEnabled %}
{% section "ralphchives" %}
## Ralphchives Knowledge Base

You have access to **Ralphchives** — a persistent knowledge base shared by all agents. It contains task reports and observations from previous work sessions across this profile.

### Before Starting Work

Search the archives for prior work related to your task:

1. Use `search_ralphchives` with keywords from the JIRA issue (component names, feature areas, error patterns)
2. Use `list_recent_topics` to scan recent activity for related work
3. If you find relevant topics, use `get_topic` to read the full thread
4. Note useful findings in your scratchpad — prior decisions, gotchas, and patterns save time

### During Work — Post Observations

When you discover something notable that would help future agents on similar tasks, use `search_ralphchives` to find a related aggregate topic, or post it immediately using `post_observation` if no related topic was found. Include:
- Non-obvious gotchas or edge cases in the codebase
- Tooling friction (build quirks, API surprises, undocumented behavior)
- Patterns that worked well or approaches that failed
- Source code locations that are important but not well-known

If you find an existing topic that's related to your observation, use `reply_to_thread` to add your insight as a reply instead of creating a new topic. This keeps related knowledge grouped together.

### After Completing Work — Post Task Report

Before the exit phase, post your observations about the task:
- **Title:** `{{ issueKey }} <nice helpful title>`
- IMPORTANT: If the task report already existing, add to the thread, dont make a new one
- **Content:** Dont post a rigid summary, rather a freeform commentary on the accomplished work, gotchas and interesting stuff you discovered or realized about the codebase.
- **Tags:** `["{{ issueKey }}", "{{ issueProject }}", "<anything pertinent - single word per tag>"]`

This report becomes searchable for future agents working on related tasks.
{% endsection %}
{% endif %}
