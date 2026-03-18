## Agent-as-function

The first real step away from a monolithic long-running agent is to stop treating subagents like little people you chat with and start treating them like functions with explicit input and output.

In this model the top-level agent is not another worker that also delegates sometimes. It is a router. It decides which specialist runs next, waits for a small completion signal, and keeps the workflow moving. The actual work happens elsewhere.

Why does this matter?

Because the default multi-agent pattern in current coding harnesses is still heavily context-coupled. A subagent returns a long report as conversation text, the parent absorbs that into its own context window, and then some summarized version of that gets passed to the next subagent. It feels convenient at first, but it creates exactly the thing long-running autonomous sessions are already bad at: bloated context, lossy handoffs, and more randomness after every phase.

The core move here is simple: separate control flow from data flow.

### Orchestrator to specialist

Under this pattern, the top-level agent dispatches a specialist with only the minimum routing context: task identity, role, and a short directive. The specialist does not send its real output back through the conversation. It writes that output to the filesystem and returns only a compact status object. The orchestrator reads the status, not the artifact.

In other words:

- control flow is vertical: orchestrator to subagent to orchestrator
- substantive data flow is horizontal: subagent to filesystem to downstream subagent
- the orchestrator remains context-light because it only sees routing signals, not reports

This turns the orchestrator into a pure coordination layer. It can stay stable across long runs because its context window only carries workflow state, not the full intellectual history of every sub-task.

See the accompanying pipeline sketch:

![assets/agent-as-function-pipeline.drawio.svg](../../assets/agent-as-function-pipeline.drawio.svg)

### Intermediate artifacts as coordination

Filesystem artifacts are the coordination medium. Each specialist writes into its own artifact directory and exposes a small, stable contract to the rest of the system.

The critical file is `status.json`. This is the only artifact the orchestrator reads. It contains a bounded summary of what happened: did the agent finish, what result code did it produce, what files did it write, what probably happens next. Everything else stays out of the orchestrator context.

That gives a clean split between two very different concerns:

- routing state: small, structured, safe to keep in the parent context
- work product: potentially large, detailed, and only relevant to downstream specialists

This is especially useful for the kinds of intermediate outputs that naturally appear in nontrivial coding workflows:

- initial exploration results
- problem or task analysis
- implementation plans
- task graphs
- reviewer findings
- verification reports

Those artifacts can be markdown when readability matters, or structured data when downstream automation matters more. A planning phase might emit a markdown plan for humans, a JSON task graph for routing, or both.

The important part is not the file format. The important part is that the artifact exists outside the orchestrator's context window and the next specialist can read it directly.

### Purity and bounded context

The main benefit is context purity. The orchestrator no longer needs to read a five-page analyst report just to decide whether to dispatch the coder. It only needs a result like `analyzed`, `blocked`, or `needs-revision`. That keeps the parent reasoning surface narrow and reduces how much irrelevant material gets compacted, distorted, or forgotten later in the run.

It also sharpens role boundaries. A pure router should not quietly drift into doing analyst or reviewer work itself just because that feels cheaper in the moment. Once the orchestrator starts reading artifact content and making semantic judgments about it, the separation is gone and the same context-coupling problem comes back under a different name.

So the design pressure pushes toward a very simple rule:

- orchestrators route on status
- specialists reason on artifacts

That rule is what makes the whole thing scale.

### Iteration and self-convergence

This pattern gets more useful, not less, when the workflow includes loops.

Take a coder-reviewer cycle. The reviewer should not send a long review back through the orchestrator, forcing the orchestrator to remember it and restate it later. The reviewer writes `output-v1.md`, updates `status.json`, and exits. The coder's second iteration reads the analyst artifact plus the reviewer artifact directly and produces `output-v2.md`.

This does two things.

First, it preserves full fidelity across iterations. No summarization step is needed between reviewer and coder. Second, it makes loop bounds explicit. Because every iteration is versioned and every run appends to a manifest, the system can tell whether it is actually converging or just going in circles.

This is where self-convergence starts to become an actual architectural property instead of just a nice idea. If each phase emits stable artifacts and bounded status signals, a coordinator can re-enter earlier phases, trigger another round, and still keep the control surface manageable.

### Generalizing to multiple nesting levels

Once the orchestrator-specialist pattern works at one level, the same idea generalizes naturally:

- orchestrator
- coordinator
- subcoordinator
- specialist

At each layer, the parent stays as pure as possible and the child layer absorbs the amount of domain detail appropriate to its scope. The deeper you go, the more concrete the work gets. The higher you stay, the more abstract and routing-oriented the reasoning gets.

This produces a pyramid of purity and abstraction.

At the top, the session orchestrator should know almost nothing about the task domain beyond which phase is complete and which one should run next. Mid-level coordinators know more about one slice of the workflow, but they still mostly route and aggregate. Leaf specialists are the ones that actually touch code, documents, tools, and source material.

That layered exposure is a form of progressive disclosure. Instead of giving one agent the whole problem and asking it to hold every constraint in its head for hours, and run against the ever present nemesis of context compaction, the system reveals only the amount of problem space that each layer actually needs.

### Declarative versus imperative prompting

This architecture also shifts the prompting style.

Imperative prompting tells an agent what exact sequence of actions to perform: read this file, inspect that module, write a plan, run this test, summarize the result. That works, but it is fragile. The parent prompt slowly turns into a script, and every extra responsibility increases the chance that the agent drops something during a long session.

Agent-as-function makes a more declarative style possible. Instead of encoding the entire procedure inside one prompt, the system describes the desired state transition for each role and relies on the workflow structure to provide the necessary inputs. The analyst is asked to produce an analysis artifact for this task. The planner is asked to turn that analysis into an executable task graph. The coder is asked to turn the current plan and latest review artifact into the next implementation attempt.

So the prompt stops being a full script and starts looking more like a contract over state:

- given the current artifacts and task context
- produce the next valid artifact and status signal
- let the workflow decide what happens afterward

That is a much better fit for autonomous systems. The control plane stays explicit, while the work plane stays local to the specialist actually doing the task.

### Practical application

Agent-as-function is a way that helps me think about maintaining structure. It is a way to build a wall around the LLM random walk.

Current coding harnesses are already pretty strong ReAct environments. The bottleneck is usually not raw tool access. It is the instability introduced by large, noisy, long-lived contexts. Once too much stuff gets shoved into the same conversation, recall gets worse, compaction gets riskier, and each extra handoff becomes more lossy.

By moving intermediate reasoning products out of the parent conversation and into artifacts, the system preserves more signal, reduces accidental coupling between phases, and makes the workflow much easier to inspect, retry, and extend.

