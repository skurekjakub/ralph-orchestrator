# Context purity

> Continues from the introduction draft, after the single-agent + subagent section.

The previous sections established three compounding problems:

1. Context windows degrade over time. Compaction and summarization are lossy, and the longer a session runs, the more the agent's working representation of the task drifts from reality.
2. A single agent doing everything accumulates too many responsibilities in one context, and eventually starts operating on its own compressed recollections rather than actual information.
3. Splitting work into subagents helps during execution, but when the subagent finishes, its output gets pushed back into the parent's context. The parent still ends up carrying an ever-growing pile of exploration results, analysis summaries, review notes, and implementation details from every child it ever spawned.

So the problem is not just that one context window is too small. The problem is that the conversation itself is the wrong place to store and pass around the output of a multi-step workflow.

That is what context purity is about.

## What it means

The idea is straightforward: an agent should only carry in its context the information it actually needs for its own job. Not everything the system has ever produced. Not the full output of every subagent it ever called. Just what it needs to make its next decision.

For a top-level agent whose main job is deciding what happens next in a workflow, that means it should not need the complete contents of every sub-task result. It should not be reading ten-page analysis reports just to figure out whether the analysis phase finished successfully. It should not be absorbing full review transcripts just to decide whether to dispatch a rewrite.

What it actually needs is much smaller:

- did the last step finish
- did it succeed, fail, or produce something that needs revision
- what should happen next

Everything else, the detailed analysis, the actual code changes, the review comments, the verification reports, all of that is valuable, but it does not need to live inside the top-level agent's context. It needs to live somewhere the system can access it. Those are different things.

## Why it matters

This is not an aesthetic preference. It is a direct response to the degradation problem.

The top-level agent is the component that survives the longest in any multi-step workflow. It is the one that sees the most transitions, the most subagent returns, the most accumulated state. If that agent is allowed to absorb the full detail of everything that happens underneath it, then it becomes the single biggest target for compaction loss. Every piece of information it carries that it does not actually need is material that will eventually get summarized, distorted, or dropped, and that degrades its ability to make correct decisions later.

Keeping the top-level agent's context clean is not about making the architecture look tidy. It is about making the agent that matters most, the one coordinating the whole run, more resistant to the exact failure mode that makes long sessions unstable.

It also makes the system easier to recover from crashes and failures. If the meaningful state of the workflow is stored externally rather than inside one agent's memory, then restarting that agent does not mean losing the state. The work products are still there. The progress information is still there. The agent can pick up where it left off instead of trying to reconstruct everything from a compacted conversation history.

## What changes in practice

Once this principle is taken seriously, it changes how subagents communicate with the parent.

In the naive model, a subagent does work and returns its findings as text. The parent reads the text, absorbs it, and uses it to decide what to do next. That is the delegation pattern described in the previous section.

Under context purity, the flow changes. The subagent still does work in its own isolated context, but instead of returning the full result to the parent through the conversation, it writes its real output somewhere external, typically the filesystem, and tells the parent only the minimum it needs to know: I finished, here is the outcome category, here is where to find the details if anyone downstream needs them.

The parent never reads the full output. It only reads the short completion signal. Downstream agents that actually need the detailed output read it directly from the filesystem, not from the parent's retelling of it.

That is the key structural change. Information still flows through the system, but it flows through files rather than through one agent's context window. The parent stays lean. The detailed work products stay intact. And no intermediate summarization step is needed because each downstream agent reads the original, not a compressed copy.

## Toward treating agents as functions

This naturally leads to a different way of thinking about what a subagent is.

In the naive model, a subagent is something you talk to. You give it a task, it does work, and it talks back. The conversation is the interface.

Under context purity, that conversational interface becomes a liability, because every word that comes back adds to the parent's context load. So the question becomes: what is the minimum interface between a parent and a child agent that still lets the system work?

The answer turns out to look a lot like a function call.

The parent provides a small input: what to do, maybe what to read, maybe some constraints. The child runs, does its work, writes its output externally, and returns a short structured signal. The parent uses that signal to decide the next step. It never touches the actual output.

That is the pattern this repository calls agent-as-function. The name is meant literally. The subagent is treated as a function with a defined input, a defined output location, and a bounded return value. The parent calls it, waits for the return, and routes based on the result. The substantive data flows outside the conversation entirely. The parent context window effectivelly becomes a callstack.
