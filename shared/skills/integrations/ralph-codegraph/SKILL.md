---
name: ralph-codegraph
description: "Query Xperience source code structure using the CodeGraphContext MCP tools — call chains, class hierarchies, dead code, complexity metrics, and raw Cypher queries against an indexed graph of the codebase. Use this skill when you need structural answers about the source code that grep and file search cannot efficiently answer."
---

# Code Graph Queries

Use the CodeGraphContext (CGC) MCP tools to answer **structural** questions about the Xperience source code. The graph is pre-indexed on container startup — you do not need to index manually.

## When to Use This vs. File Search

| Use CGC | Use grep / file search |
|---|---|
| "What calls `ProcessPayment`?" | "Find TODO comments" |
| "Show the class hierarchy for `PageBuilderComponent`" | "Find files matching `*.cs`" |
| "Is `OldHelper` used anywhere?" (dead code) | "Search for string `API_KEY`" |
| "What does `Initialize` call under the hood?" | Content/pattern matching |
| "Trace from `Register` down to `SaveToDatabase`" | "Find files containing `using CMS.Core`" |

**Rule:** structural questions → CGC tools. Content/pattern questions → text search.

## Verify the Index

Before your first query, confirm the repo is indexed:

```
Tool: list_indexed_repositories
```

If the Xperience repo is missing, index it:

```
Tool: add_code_to_graph
Args: { "directory_path": "resources/repositories/xperience" }
```

Then poll until done:

```
Tool: check_job_status
Args: { "job_id": "<id>" }
```

### Useful patterns

**All classes implementing an interface:**
```cypher
MATCH (c:Class)-[:INHERITS]->(i:Class {name: 'IPageBuilderComponent'})
RETURN c.name, c.path
```

**Hub functions (refactoring targets):**
```cypher
MATCH (f:Function)
OPTIONAL MATCH (f)-[:CALLS]->(callee:Function)
OPTIONAL MATCH (caller:Function)-[:CALLS]->(f)
WITH f, count(DISTINCT callee) AS out, count(DISTINCT caller) AS inc
ORDER BY (out + inc) DESC LIMIT 10
RETURN f.name, f.path, inc, out
```

**Cross-namespace calls:**
```cypher
MATCH (caller:Function)-[:CALLS]->(callee:Function)
WHERE caller.path CONTAINS 'CMS/ContentEngine' AND callee.path CONTAINS 'CMS/DataEngine'
RETURN caller.name, callee.name
```

## Graph Model Reference

| Node | Properties |
|---|---|
| `File` | `name`, `path` |
| `Function` | `name`, `path`, `line_number`, `end_line`, `args`, `decorators`, `docstring` |
| `Class` | `name`, `path`, `line_number`, `end_line` |
| `Module` | `name`, `path` |

| Edge | Meaning |
|---|---|
| `(:Function)-[:CALLS]->(:Function)` | Call graph |
| `(:Class)-[:INHERITS]->(:Class)` | Inheritance / implements |
| `(:File)-[:CONTAINS]->(:Function\|:Class)` | Containment |
| `(:File)-[:IMPORTS]->(:Module)` | Dependency |

## Rules

- CGC answers **structural** questions. For content searches, use file search / grep with `includeIgnoredFiles: true`.
- Use `context` parameter to disambiguate common symbol names.
- Results include file paths and line numbers — use them to read the actual source code for full context.
- The graph is rebuilt from scratch on each container start. Changes during a session are not reflected unless you re-index.
