disable all default copilot cli tools for web access

change xperience repo sideclone to `git add remote` (benefits?)

add validation to allowed triggerparams => 
`const defaultBranch: string = taskCtx.triggerParams['source_branch'] ?? "main";`

    lines.push("    environment:");
    lines.push('      REPO_ROOT: "/workspace"');

-------------------------------------------------------------

when you're done throughly audit your changes look for bugs, edge cases, missed tests, bugs possible refactoring opportunities and implement, 

finally, update all main repo documentation - CONFIGURATION.MD, ARCHITECUTRE.MD, README.MD, copilot-instructions.md, 

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

alright now lets focus on refactoring 

---

## Core Directives

### 1. Understand Before You Touch
- **Read every file in the change radius** before proposing edits. Map the dependency graph of the classes/modules you'll touch.
- Identify the **public API surface** of each class. Any change to a public method signature is a breaking change — flag it explicitly.
- Run `npx vitest run` (or the project's test command) **before** making any changes to establish a green baseline. If tests are already failing, report which ones and do not conflate pre-existing failures with your refactor.

### 2. Refactoring Taxonomy — Apply in Priority Order
Work through these smells/patterns **in order**. Fix the highest-impact items first.

| Priority | Smell / Pattern | Action |
|----------|----------------|--------|
| P0 | **Broken abstractions** — God classes, classes doing I/O + logic, mixed concerns | Extract into focused classes behind interfaces. Apply Single Responsibility. |
| P1 | **Missing dependency injection** — hard `new` or direct imports of concrete implementations inside business logic | Inject dependencies via constructor. Define interfaces/abstract classes for seams. |
| P2 | **Primitive obsession & stringly-typed code** | Introduce Value Objects, enums, branded types, or Zod schemas. |
| P3 | **Duplicated logic** | Extract shared behavior into base classes (prefer composition), utility modules, or generic methods with proper type constraints. |
| P4 | **Long methods (>20 LOC of logic)** | Extract private methods with descriptive names. Each method should do one thing at one level of abstraction. |
| P5 | **Weak or missing types** — `any`, type assertions, untyped third-party boundaries | Add strict types at module boundaries. Use `unknown` + type guards instead of `any`. Wrap third-party calls in typed adapters. |
| P6 | **Naming & readability** | Rename to reveal intent. Classes = nouns. Methods = verbs. Booleans = `is/has/should` prefix. |

### 3. OOP & TypeScript Constraints
- **Prefer composition over inheritance** unless there is a genuine "is-a" relationship.
- Use `interface` for contracts consumed by other modules; use `abstract class` only when you need shared implementation.
- Mark fields `private` or `readonly` by default. Expose only what's necessary.
- Use **generics** to eliminate duplication — but stop before the type signature is harder to read than the code it replaces.
- Never suppress the compiler: no `// @ts-ignore`, no `as unknown as X` chains, no `any` escapes.
- Use `satisfies` over `as` when asserting type compatibility.

### 4. Testing Rules (Vitest)
- **Every refactored public method must have corresponding tests.** If tests don't exist, write them *before* refactoring (characterization tests), then refactor, then verify they still pass.
- Follow the **Arrange → Act → Assert** pattern. One logical assertion per test (multiple `expect` calls are fine if they assert the same behavior).
- Use `describe` blocks that mirror the class name; nested `describe` for method names:
  ```ts
  describe('OrderService', () => {
    describe('placeOrder', () => {
      it('should create order when inventory is available', () => { ... });
      it('should throw InsufficientStockError when inventory is empty', () => { ... });
    });
  });
  ```
- **Mock at the seam, not the implementation.** Mock interfaces/abstract classes injected via constructor — never mock private methods or internal state.
- Use `vi.fn()` and `vi.spyOn()` for test doubles. Prefer **stubs** (canned responses) over **mocks** (behavior verification) unless the interaction *is* the behavior under test.
- Use `beforeEach` for shared setup; never let test order matter.
- For async code, always `await` the result or use `expect(...).rejects.toThrow(...)`. No fire-and-forget.

### 5. Process & Output Format

For **each file you change**, output:

```
### <filepath>

**What changed:** <1-2 sentence summary>
**Why:** <which smell from the taxonomy + reasoning>
**Risk:** LOW | MEDIUM | HIGH
**Breaking:** YES (describe migration) | NO
```

Then provide the **full updated file contents** (never partial diffs for modified files).

After all file changes, provide:

1. **New/updated test files** — full contents.
2. **Migration checklist** — if any public API changed, list every call-site that needs updating.
3. **Verification command** — the exact shell command to run the relevant test suite.

### 6. What NOT to Do
- **Do not change behavior.** Refactoring ≠ feature work. If you spot a bug, report it separately — do not fix it in the same changeset unless explicitly asked.
- **Do not refactor test files** unless they're testing something you've restructured and need to follow the new API.
- **Do not introduce new dependencies** (npm packages) without explicit approval.
- **Do not gold-plate.** If a section of code is outside the change radius and works fine, leave it alone.
- **Do not create barrel files (`index.ts` re-exports)** unless the project already uses that pattern.

---

if you need to confirm anything during the resaerch phsae just ask me