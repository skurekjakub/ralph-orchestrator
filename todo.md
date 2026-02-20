
the ralphchives
- contain the condensed knowledge of all past ralphs
- structured as a forum per profile/variant/task
- should be semantically searchable and fuzzy searchable
- maybe some forum???? but i also wanna RAG it so liek nice data format to enable that (forum - NodeBB - api access to JSON dumps of threads)
- every ralph posts at the end of session its handoff plus some personal comments or opinions on the task in a new thread
- other ralpsh have option to call `consult_ralphchives` and get back info - if they find it useful, they comment on the thread. could be cool to see organically develop
- the forum database should be portable with the repo + mergable (different fs file per project?)
+ tool for:
    - fuzzy search (+ eventually RAG)
    - create thread
    - reply to thread

squid.conf - needs to be dynamically including like discord domain as well - security hardening

the over-ralph
- impleemntation roadmap breakdown for large fuzzy tasks
- whats the expected output/artifacts. Jira issue subtasks???

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
- fix tool log streaming. websockets in general seem sussy

extract malph and ralph profiles

git - given empty folder and told to clone and do everything and then rm -rf when done

smuggle custom mcp tools to the target repo
- general issue - smuggle artifacts ain and out of container via a unified pipeline

pause the copilto process if observer detects rm and other sus commands being called in the copilot cli

parallelsim via primary config, default 1

https://docs.github.com/en/copilot/reference/cli-command-reference
- anything here that could improve results when running in headless mode???

take a look at preflights

test malph

unify validation


investigate root/vscode file/folder rm -f permissions from ContainerWOrkspaceCleaner - Dockerfile creation requiremens/DAC/CHOWN in docker-compose.security? CAP_ADD

structured prompt building aka copilot extension
<UserMessage>
  <!-- Notebook format instructions if relevant -->
  <NotebookFormat />
  
  <!-- Chat variables (file attachments, etc.) -->
  <attachments>
    [Attached files, images, diagnostics, tool references]
  </attachments>
  
  <toolReferences>
    The user attached the following tools to this message...
    [List of tool names]
  </toolReferences>
  
  <context>
    [Current date]
    
    <EditedFileEvents>
      [Recently edited files in the session]
    </EditedFileEvents>
    
    <NotebookSummaryChange />
    
    <TerminalState />
    
    <TodoListContext />
  </context>
  
  [CurrentEditorContext - active editor file/selection]
  
  <reminderInstructions>
    <!-- Critical reminders repeated near user message -->
    [Editing tool reminders]
    [Notebook reminders]
    [Skill adherence reminders]
  </reminderInstructions>
  
  <userRequest>
    [User's current query text]
  </userRequest>
  
  <cacheBreakpoint /> [if cache breakpoints enabled]
</UserMessage>

send completely different prompt for revision workflow

harden and reenable claude code cli

compose-client env handling.

preflight for revision workflow - update tool calls after

check for better source image - ubuntu-alpine? no python3 etc

allowedUrlPaths should not be set on mcp.config or? each profile should also have baseAllowedUrlPaths - because of setup.sh 

infrastructure vscode user hardcoded dependency - fucking devcontainers

hardbake issue id and pr id into the mcp servers - no parameterization - further restrict ai bullshit

cleaning abandoned containers starts inside orchestrator - hm? i guess the profiles need to be resolved yea

whitelist jira account that can invoke the agents