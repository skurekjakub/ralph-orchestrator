# Revision Mode

Revision planning is not the same as first-pass planning.

You are not rediscovering the whole task. You are turning reviewer findings and feedback into the smallest useful set of fix tasks.

## Revision planning goals

- preserve already approved work
- keep the current task loop narrow
- avoid reopening unrelated tasks
- make each fix task map cleanly to reviewer findings

## Reuse vs split

Reuse the existing task shape when:
- feedback only affects one current task
- the fixes stay inside the same file cluster
- the same reviewer concerns still apply

Split into new fix tasks when:
- one reviewer finding reveals a separate navigation/frontmatter task
- one fix is code-sample specific and should be isolated
- part of the feedback can be fixed independently while another part is blocked

## Approved work

Treat already approved tasks as stable unless the new feedback directly reopens them.

Do not create a new task that casually re-edits an approved area just because it is nearby.

## Reviewer findings to task conversion

When planning from reviewer findings:
- cluster findings by file ownership and root cause
- keep technical, style, and IA concerns together only when one code/doc change resolves all of them
- separate “real fix task” from “future suggestion”

## Deferred revision work

Defer a revision item when:
- it belongs in `_guides`
- it requires a different workflow
- the feedback asks for a wider restructure than this revision should take on
- the evidence is too weak to define a safe task

Always record why the work was deferred.
