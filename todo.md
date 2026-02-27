disable all default copilot cli tools for web access

change xperience repo sideclone to `git add remote` (benefits?)

add validation to allowed triggerparams => 
`const defaultBranch: string = taskCtx.triggerParams['source_branch'] ?? "main";`

    lines.push("    environment:");
    lines.push('      REPO_ROOT: "/workspace"'); <- hardcoded

dashboard attached to process and allows remote kill????

-------------------------------------------------------------

when you're done throughly audit your changes look for bugs, edge cases, missed tests, bugs possible refactoring opportunities and implement, 

finally, update all main repo documentation - CONFIGURATION.MD, ARCHITECUTRE.MD, README.MD, copilot-instructions.md, and the dataflow diagram

------------------------------------------------------------

JIRA task dependencies - this taks depends on another task - linked issues and statuses - orchestrator uses that to give context somehow - like if linked isseu is required but not compelte, search for that issue PR and build o ntop of it

discord connector for throwaway task liek creating jira issues

pass in image attachments from issue

if issue has related issues - include basic info like description to the prompt?

local dashboard
- log viewer syntax highlighting - log event type at least
- fix tool log streaming. websockets in general seem sussy

git - given empty folder and told to clone and do everything and then rm -rf when done

pause the copilto process if observer detects rm and other sus commands being called in the copilot cli

parallelsim via primary config, default 1

investigate root/vscode file/folder rm -f permissions from ContainerWOrkspaceCleaner - Dockerfile creation requiremens/DAC/CHOWN in docker-compose.security? CAP_ADD

send completely different prompt for revision workflow

harden and reenable claude code cli

compose-client env handling.

preflight for revision workflow - update tool calls after

check for better source image - ubuntu-alpine? no python3 etc

allowedUrlPaths should not be set on mcp.config or? each profile should also have baseAllowedUrlPaths - because of setup.sh 

~~app container Dockerfile hardcodes vscode at UID/GID 1000~~ fixed - profiles/ralph-docs/Dockerfile now uses ARG HOST_UID/HOST_GID, consumed from ComposeClient env injection.

hardbake issue id and pr id into the mcp servers - no parameterization - further restrict ai bullshit

cleaning abandoned containers starts inside orchestrator - hm? i guess the profiles need to be resolved yea

whitelist jira account that can invoke the agents

reasoning level xhigh config for codex models and other

neo4j graph db graph extension to basic rag in ralphchives

every orchestrator mounted folder should come with .gitignroe

take away git from agent - only expose minimal set of tools - PAT for kenticoazurewhatever lives in mcp container gatewat, which also has the entire wrokspace mounted (or maybe just a portion necessary? research what counts as being in the contenxt of a repo for the purpose of git pull/branch/etc)

agent itself -> squid -> only copilot apis. 

mcp container full access to web -> expose web fetch tool. https://github.com/damionrashford/RivalSearchMCP

disable all default web access tools.



fix config.ts

filter orchestrator comments and params from the final prompt

phased context augemnt - taskrunner now supports execution phases - leverage that to progressively augment agent context as it works on long horizon tasks - means multiple calls -> expensive


-

----------------------------

comvert all mcp servers to modules

expose external endpoint for cusotmization to register into di