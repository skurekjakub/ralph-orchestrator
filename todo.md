
the ralchives
- fuzzy search (+ eventually RAG)
- create thread
- reply to thread

the over-ralph
- impleemntation roadmap breakdown for large fuzzy tasks

conditionally enhance prompt based on agent type

semantic grouping in prompt similar to copilot?

profiles/ralph-docs/resources - mount to gitignored path

JIRA task dependencies - this taks depends on another task - linked issues and statuses - orchestrator uses that to give context somehow - like if linked isseu is required but not compelte, search for that issue PR and build o ntop of it

refine or cut external dashboard

update JQL poller to only gather issues that have someone assigned, not None

discord connector for throwaway task liek creating jira issues

tests folder organization

pass in image attachments from issue

put jira cloud id to env vars instead of config

pleb ralph - conversation only - gets jsut the context of the JIRA issue

way to completely blacklsit POST to specified URLs from inside the container - second layer of security - what if too loose pat generated for example

if issue has related issues - include basic info like description to the prompt?

local dashboard


- log viewer syntax highlighting - log event type at least

extract malph and ralph profiles

git - given empty folder and told to clone and do everything and then rm -rf when done

smuggle custom mcp tools to the target repo
- general issue - smuggle artifacts ain and out of container via a unified pipeline

pause the copilto process if observer detects rm and other sus commands being called in the copilot cli