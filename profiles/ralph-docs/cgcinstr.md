# Ralph — Agent Instructions

## Bootstrap: Code Graph

This workspace has CodeGraphContext (CGC) configured as an MCP server. It indexes the codebase into a graph database so you can query code relationships, call chains, dead code, and complexity without reading every file.

**Before doing any code analysis or making changes, you must index the workspace:**

1. Call `watch_directory` with path `/workspace`. This indexes all files and starts watching for changes.
2. Call `check_job_status` to confirm indexing is complete before proceeding.
3. Call `list_indexed_repositories` to verify the workspace appears.

Do not skip this step. The graph is empty until you index. Queries against an empty graph will return nothing and waste time.

## Using the Code Graph

Once indexed, prefer graph queries over grepping or reading files when you need to understand structure:

- **Before modifying a function:** call `analyze_code_relationships` to find all callers. Understand the blast radius before changing anything.
- **Before adding a new feature:** use `find_code` to locate existing implementations of similar patterns. Follow established conventions.
- **When debugging:** use `analyze_code_relationships` to trace call chains from entry points to the area of interest.
- **When cleaning up:** call `find_dead_code` to identify unused functions. Call `find_most_complex_functions` to find candidates for refactoring.
- **For custom queries:** use `execute_cypher_query` to run direct Cypher against the graph when the built-in tools don't cover your question.

## When to Reindex

If you create, rename, or delete files during your session, the watcher should pick up changes automatically. If results look stale or you suspect the graph is out of date, call `watch_directory` again on `/workspace`.

## Project Structure

This is a mixed-language codebase (Ruby, JavaScript, TypeScript, .NET). CGC parses all of these into the same graph. Cross-language runtime boundaries (e.g., JS frontend calling Ruby API endpoints) are not captured in the graph — reason about those from naming conventions and route definitions.

## General Guidelines

- Read the code graph before reading files. It's faster and gives you structural context.
- When asked about "who calls X" or "what does X depend on", always use the graph tools rather than grep.
- If indexing fails or CGC is unavailable, fall back to normal file reading but note that structural queries will be limited.