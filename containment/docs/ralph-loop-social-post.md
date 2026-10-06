# Autonomous "Raph Wiggum" Implementation Loop for VS Code Copilot

- First publication: https://www.reddit.com/r/GithubCopilot/comments/1qapkdg/ralph_wiggum_technic_in_vs_code_copilot_with/
- X tweet: https://x.com/stibbons31/status/2020456046259589229

I tried a prompt in VC Code Copilot that triggers a "Ralph Wiggum" loop to implement a (hopefully) well crafted, 26 tasks PRD. This is ideal to trigger the implementation after an interactive Plan session with your favorite model.

This is a Proof of Concept on how to use an orchestrator agent that will trigger subagent to implement individual tasks and restart them until all tasks are implemented.

This is a Ralph Wiggum loop, but adapted to VS Code Copilot.

I was very impressed because I could use Claude Opus (3x !) in a single prompt and it completed it all in ~2 hours. Apparently, there MIGHT be several Premium requests consumed in such a loop, but so far i did not experienced it.

## Plan Mode

I do not use Copilot CLI, or Claude Code CLI, I want something only on VS Code Copilot chat.

First, I crafted a specification with a split already done in an set of actionable tasks. Claude Sonnet created for me 26 tasks, some could be done in parallel, some sequentially.

You can look at the `craftman-plan-only.agent.md` file in this gist, it is a classic Plan mode with initial interview. It organize the plan and tasks in `.agents/changes/<JIRA-id>-<short-description>/`.

I make it generate the following files in this folder:
- `00.request.md` : the initial human request. Usually a badly written JIA
- `01.specification.md`: the main output of the Plan mode, with reviewable design and architectural choices. No technnical detail, no code
- `02.plan.md`: The tasks plannification, with task dependencies, technical details, low level. this is highly technical, can't review it... But once done it is never used after task breakdown is finished.
- `03.tasks.xx.md`: an actionable tasks, that will be implemented in subagent by Ralph. Each task is unitary, has a section to provide the minimal among of context for a fresh new coding agent to understand the minimal of what it needs to know to perform the task. Usually the model generate a `03.tasks.00.READBEFORE.md` with a pointer to the spec, to some project guidelines,...

In other word, if a fresh new agent takes directly a `03.tasks.*.md` file, it will use progressive disclosure to the (hopefully) right among of data to do its job.

## Ralph loop

This is done by the Agent `craftman-ralph-loop.agent.md`.

Then, once I have the <PLAN> file and <TASKS> folder ready, i basically started a new Opus chat with a prompt like this:

- you are orchestrator
- you will trigger subagents
- you follow the subagent progress through a PROGRESS.md file
- you stop only when all tasks are set as completed.

for each subagent:

- you are a senior software engineer
- you will pick an available task
- you complete the implementation
- you create a concise, impact oriented conventional commit message
-  you update the PROGRESS.md

## Results

It works, BUT this is not perfect.

At end end, I see the subagents being triggered, the reviewers subagent criticizing each tasks, restarting sometime some tasks, and it goes up to the very end of the plan autonomously.

BUT:
- the orchestrator chooses the tasks and send the task # to implement to the subagent, despit the instruction "let the subagent chooses"
- I added a phase reviewer that is rarely started
- i often hit the daily or weely rate limit, and retry does not do the right thing (it "forget" to trigger subagent, and does the implementation in the orchestrator). → the best way to deal with this is to start a new chat
- and at the end, it think it has finished, all the features are here, the complete preflight passes, no unit test fails, it added a tons of unit test and so, but the software itself might not work at all, or not do all of what has been developped, especially if there are UI involved. Strangely, most of the time ALL the features are here, but not accessible to the user, despite an intensive planning and spec session with opus and not visible gap in the plan itself.