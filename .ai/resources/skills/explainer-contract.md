# Explainer contract

> **Adapt me.** Shared by `feature-development`, `codebase-refactoring` and
> `codebase-analysis`. (`project-bugfixing` keeps its own four-section
> template in its skill folder.)

The explainer is the page the user reads instead of the diff. It is written
last, from the finished work, and published so its URL can go in the PR body
and the tracker comment.

## Template

Copy `.ai/resources/skills/explainer-template.html`, fill every `FILL:`
slot, delete unused slots and the instruction comments. Don't restyle it —
every explainer is one page of a series.

## The four sections, in order

1. **Summary** — the broad summary: what now exists, what moved, what was
   deleted (for an analysis sweep: a findings table with the headline number
   and recommendation per finding).
2. **In plain terms** — the simplified explainer, in the subject's vocabulary,
   no file paths.
3. **Walkthrough** — the thorough version: one step per change or finding, in
   order, with `file:line` references, measurements with their methods, and
   what was deliberately left alone.
4. **Check yourself** — six to ten questions on the mechanism for the user to
   test their understanding, each answer naming the file or measurement that
   holds it.

## Title and numbers

- The title is a two-to-four-word name. The one-sentence description goes in
  the standfirst and in the `description` passed to `Artifact`.
- Every number carries its command, commit and date.

## Publishing and linking

1. Write the file into the work's journal folder (the path the workflow
   names). Keep the path stable across redeploys so the URL stays stable.
2. Publish it with the `Artifact` tool and hand the user the URL.
3. Put the URL in the PR body; once the PR exists, comment on the tracker
   issue (if any) with the PR link and the explainer link.
4. Publish only after `npm test` exits 0 on the final tree.
