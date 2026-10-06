---
name: file-github-issue
description: >-
  Use when the user asks to file, open, write up or fill in a GitHub issue for skurekjakub/ralph-orchestrator — "open an issue for this", "file a bug on GitHub", "turn this finding into an issue", "add a task for #123", "write up the follow-ups as issues" — or pastes a github.com/skurekjakub/ralph-orchestrator link wanting an issue created or rewritten from it. Not for reading, searching or triaging existing issues only.
---

# File a GitHub issue in skurekjakub/ralph-orchestrator

Produces one issue in `skurekjakub/ralph-orchestrator` that someone can pick up cold and act
on, filed with the GitHub CLI after the user has seen and approved the draft.
The issue is public to everyone with access to the repository the moment it
exists, so nothing is filed on a guess.

## Approval

`gh issue create` runs only after one of these:

- the user replied to the draft you showed them (title, body, labels, assignee)
  with a go-ahead, or
- the user said, before seeing it, that they approve the draft as you write it
  ("whatever you draft is approved", "file it without showing me").

Urgency is not approval. "Just get it in", "quick", "I'm heading into a
meeting", "don't bother me with it" ask you to be fast — they don't approve a
draft nobody has read. Be fast: finish the draft, show it, and end your turn
asking for the go-ahead. The user replies "go" and it's filed in seconds.

| Thought | Reality |
|---|---|
| "They said just get it in" | That's speed, not a review. Show the draft. |
| "They're busy; asking wastes their time" | A wrong public issue costs more than a one-word reply. |
| "I'll file it and tell them to edit it" | Everyone watching the repo was already notified. |

## Preflight

| Check | Command | On failure |
|---|---|---|
| `gh` installed and signed in | `gh auth status` | stop; tell the user to run `gh auth login` |
| Issues enabled on the repo | `gh repo view skurekjakub/ralph-orchestrator --json hasIssuesEnabled` | stop; say so |
| Issue templates | list `.github/ISSUE_TEMPLATE/` in the repo | none: use the body below |

Pass `--repo skurekjakub/ralph-orchestrator` on every `gh issue` call; never rely on the
current directory's remote, which may be a fork.

## The title is at most six words

A title is an index entry, not an abstract: it exists so someone scanning a
list of issues can tell whether this is the one they want. The evidence, the
mechanism, file paths and consequences go in the body.

| Instead of | Write |
| --- | --- |
| `Eight admin modules have no same-stem test, and two suites count path segments` | `Admin modules missing same-stem tests` |
| `verify-index: the oversize check measures a projected hit and can never fire` | `Index verifier checks never fire` |

- No colon-and-elaboration, no `and`-joined pairs (two things are two issues or
  one title naming the shared cause).
- No file paths, symbols, line numbers, issue numbers or severity words —
  severity is a label, links are in the body.

## Body

When the repo has issue templates, the matching template's headings replace
the ones below (`gh issue create --template "<name>"` pre-fills it); an issue
form (`.yml`) gets its fields answered in the same order under `###` headings.
Otherwise:

```markdown
## Context

<What this is about, in one or two sentences quoting what the source (a
finding, a PR, another issue: #123) actually claims.> <Why it matters: who is
affected and what it unblocks.>

## What to do

- <The change itself. When the source doesn't name specifics, say "pull the
  specifics from the implementation" rather than inventing them.>
- <Each behaviour or state, and what happens next.>
- <Where the change lands: files, pages, components.>

## Acceptance criteria

- [ ] <Testable yes/no item>
- [ ] <Three to seven in total; more means split the issue>

## References

- #123 — source issue
- <PR, doc, commit or file, cited by number, URL or path — never by quoting
  its title or heading>
```

All four headings appear in every issue; with no linked source, References
lists the files the change lands in. What stays out of a public issue (secrets,
internal hostnames, customer details — see Red flags) stays out of every
section, References included: a cited file's heading is quoted text too.

GitHub renders this markdown as written: `#123`, `owner/repo#123`, commit SHAs,
`@user` and bare URLs become links on their own. `@`-mention someone only when
the user asked for it — a mention notifies them.

## Workflow

1. **Pull the source**, if there is one (`gh issue view <n> --repo
   skurekjakub/ralph-orchestrator`, the PR, the finding). Quote what it claims; don't invent
   implementation specifics it doesn't give.
2. **Search for a duplicate**: `gh issue list --repo skurekjakub/ralph-orchestrator --state
   all --search "<two or three key words>"`. An open match means you offer a
   comment on it instead; a closed one goes in References.
3. **Pick labels from the repo's own list** (`gh label list --repo
   skurekjakub/ralph-orchestrator`), matching how recent similar issues are labelled. Never
   create a label, milestone or project without asking — they are shared
   repository settings.
4. **Draft the title and body**, then **show them to the user with the labels,
   assignee and milestone you intend, and wait for a go-ahead** (see
   Approval).
5. **File it** with the body on stdin, so quoting never mangles the markdown
   and no temp file is left behind:

   ```bash
   gh issue create --repo skurekjakub/ralph-orchestrator --title "<title>" --body-file - \
     [--label a --label b] [--assignee <login>] [--milestone "<name>"] <<'EOF'
   <body>
   EOF
   ```
6. **Verify**: `gh issue view <n> --repo skurekjakub/ralph-orchestrator --json
   number,title,url,labels` and hand the user the URL. A mistake is fixed with
   `gh issue edit <n> --repo skurekjakub/ralph-orchestrator` (`--title`, `--body-file`,
   `--add-label`, `--remove-label`), not by filing a second issue.

Several issues from one list (a follow-ups file, a review) are drafted
together, approved together, then filed one by one; report every URL.

## Red flags — stop

- Filing before the user approved this exact draft — or approved in advance in
  so many words. Hurry is not approval.
- A title over six words, or one that carries a path or a number.
- A label, milestone or assignee that isn't already in the repo.
- `gh` called without `--repo skurekjakub/ralph-orchestrator`.
- A secret, token, internal hostname or customer detail in the body — the issue
  may be readable far beyond the team.
