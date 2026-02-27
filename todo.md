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


-------------------

# Identifying Cross-Cutting Concerns & Refactoring Candidates

## General Refactoring Candidates

### Code Smell Detection

| Smell | Signal | Refactoring |
|---|---|---|
| **Long Method** | > 20–30 lines, multiple levels of indent | Extract Method |
| **Large Class** | > 300–500 lines, many unrelated fields | Extract Class / Split by responsibility |
| **Duplicate Code** | Same logic in 2+ places | Extract Method / Template Method |
| **Feature Envy** | Method uses another class's data more than its own | Move Method |
| **Data Clumps** | Same 3+ params always passed together | Introduce Parameter Object |
| **Primitive Obsession** | Strings/ints for domain concepts (e.g., `"USD"`) | Introduce Value Object |
| **Switch Statements** | Large switch on type | Replace with Polymorphism |
| **Shotgun Surgery** | One change requires edits in many classes | Move/consolidate related logic |
| **Divergent Change** | One class changes for many different reasons | Single Responsibility split |

```bash
# Files changed most often — high churn = pain points
git log --format=format: --name-only | sort | uniq -c | sort -rg | head -20

# Files changed by the most authors — coordination bottlenecks
git log --format='%ae' --name-only | ... 
```

Adam Tornhill's **"Your Code as a Crime Scene"** approach: overlay churn with complexity to find your riskiest files.

---

## Practical Workflow

```
1. Measure first       → metrics, churn, complexity scores
2. Read the diff       → what changed together? (temporal coupling)
3. Map dependencies    → what does everything import?
4. Apply the 3-strikes rule → see it once: ok. Twice: note it. Three times: refactor.
5. Prioritize by pain  → high churn + high complexity + many authors = refactor now
```

---

## Key Principle

> **Cross-cutting concerns** → solve with AOP, middleware, decorators, or interceptors  
> **Code smells** → solve with classical OO refactoring patterns (Fowler's catalog)  
> **Architecture-level duplication** → solve with shared libraries, domain layers, or services

The best signal is always: *"How hard is it to change this?"* If a small requirement change touches many files in unrelated modules, you've found your refactoring target.