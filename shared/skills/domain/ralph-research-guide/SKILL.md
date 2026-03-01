---
name: ralph-research-guide
description: "Complete research guide for the ralph-researcher sub-agent. Covers research order, techniques for exploring existing docs, Xperience C# source code, and external references, plus the report template and validation checklist. Read this skill and its reference files before starting any research task."
---

# Research Guide

Complete research guide for the ralph-researcher sub-agent. Read the reference files listed below before starting your research — they contain the techniques, patterns, and checklists you need.

## Reference Files

Read these from your folder:

| File | What it covers |
|---|---|
| `references/existing-docs.md` | How to navigate the docs site structure, find sibling pages, check frontmatter |
| `references/source-code.md` | How to search the Xperience C# codebase for classes, APIs, enums, defaults |
| `references/external-docs.md` | When and how to use `microsoft_docs_search` and `web_fetch` |
| `references/report-template.md` | Report template and validation checklist — structure your output using this |

## Research Order

1. **Check Ralphchives** — search for prior work on this component or feature area using the **ralph-ralphchives** skill. Past observations, gotchas, and failed approaches save you from repeating mistakes.
2. **Explore existing documentation** — find related pages, understand current coverage, identify gaps. See `references/existing-docs.md`.
3. **Explore the Xperience source code** — verify technical claims, find accurate API signatures, class hierarchies, configuration options, enum values, default settings. See `references/source-code.md`.
4. **Cross-reference external documentation** — when source code findings need clarification or the task involves .NET/ASP.NET concepts. See `references/external-docs.md`.
5. **Assemble your report** — follow the template in `references/report-template.md`. Run the validation checklist before returning.

## Rules

- **Read-only** — do NOT create, edit, or delete any files
- **Source code is ground truth.** When existing docs contradict the source, trust the source and flag the discrepancy.
- **Be specific** — include file paths, class names, method signatures, line numbers
- **Extract, don't summarize** — provide actual code snippets and content the meta-agent can use directly
- **Search gitignored paths** — the Xperience source at `resources/repositories/xperience` is gitignored; always use `includeIgnoredFiles: true` when searching it
- **Note what you couldn't find.** If you searched for something and it doesn't exist, say so explicitly — that's useful information.
