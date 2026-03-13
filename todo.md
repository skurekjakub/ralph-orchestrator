discord-hitl mcp setup

playwright version mismatch - "content": "The workspace playwright wants 1194 but we have 1208 installed. Let me create a symlink to make it work:",
"The installed Playwright expects revision 1194 (chromium-141.0.7390.37) but the cache has revision 1208. The mismatch is causing the issue. Let me try to symlink the existing browsers to the expected paths.",

codesamples:dbcheck

    lines.push("    environment:");
    lines.push('      REPO_ROOT: "/workspace"'); <- hardcoded

parallel copilot process comms - https://github.com/WiseLibs/better-sqlite3

https://github.com/agentscope-ai/ReMe
https://github.com/damionrashford/RivalSearchMCP - web search

-------------------------------------------------------------

when you're done throughly audit your changes look for bugs, edge cases, missed tests, bugs possible refactoring opportunities and implement, 

finally, update all main repo documentation - CONFIGURATION.MD, ARCHITECUTRE.MD, README.MD, copilot-instructions.md, and the dataflow diagram

------------------------------------------------------------

JIRA task dependencies - this taks depends on another task - linked issues and statuses - orchestrator uses that to give context somehow - like if linked isseu is required but not compelte, search for that issue PR and build o ntop of it

discord connector for throwaway task liek creating jira issues

pass in image attachments from issue

if issue has related issues - include basic info like description to the prompt?

local dashboard
- fix tool log streaming. websockets in general seem sussy

harden and reenable claude code cli

reasoning level xhigh config for codex models and other

neo4j graph db graph extension to basic rag in ralphchives

phased context augemnt - taskrunner now supports execution phases - leverage that to progressively augment agent context as it works on long horizon tasks - means multiple calls -> expensive

----------------------------

17:19:58 [INFO] Stopping containers...
17:19:58 [INFO] Stopped streaming pre-tool
17:19:58 [INFO] Stopped streaming tool-output
17:19:58 [INFO] Stopped streaming sidecar

the streaming output for these doesnt work btw, dont think it ever did. i have to wait until the full log colelction step to get it

convert all mcp servers to modules
