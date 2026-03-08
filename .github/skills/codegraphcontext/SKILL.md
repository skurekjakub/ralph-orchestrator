---
name: codegraphcontext
description: "Query and analyze codebase structure using CodeGraphContext (CGC) — a code graph MCP server that indexes source code into a graph database for structural queries. Use this skill when exploring call chains (who calls X, what does X call), detecting dead code, analyzing cyclomatic complexity, finding class hierarchies, tracing cross-module dependencies, running Cypher queries against a code graph, or understanding code architecture at scale. Triggers on: call chain, dead code, unused functions, cyclomatic complexity, who calls, what calls, class hierarchy, code graph, cgc, codegraphcontext, find callers, find callees, graph query, cypher query, hub functions, structural analysis."
---

# CodeGraphContext

Use CGC's MCP tools to query code structure — call graphs, inheritance, imports, complexity, and dead code. CGC indexes source code into a graph database (FalkorDB Lite or Neo4j) using Tree-sitter parsing.

## When to Use CGC vs. Other Tools

| Use CGC | Use file search / grep |
|---|---|
| "What calls `processPayment`?" | "Find TODO comments" |
| "Show the class hierarchy for `BaseConnector`" | "Find files matching `*.test.ts`" |
| "Is `oldHelper` called anywhere?" (dead code) | "Search for string `API_KEY`" |
| "What's the most complex function?" | "Find files containing `import { Router }`" |
| "Trace the call chain from `main` to `cleanup`" | Content/pattern matching |

**Rule:** structural questions → CGC. Content/pattern questions → text search.

## Pre-Flight: Ensure the Repo Is Indexed

Before querying, verify the repository is indexed:

```
Tool: list_indexed_repositories
Args: {}
```

If the repo is missing, index it:

```
Tool: add_code_to_graph
Args: { "directory_path": "/path/to/repo" }
```

Then track the async job:

```
Tool: check_job_status
Args: { "job_id": "<id from add_code_to_graph>" }
```

## Core Query Patterns

### Find a symbol

```
Tool: find_code
Args: { "query": "TaskRunner" }
```

Returns: file path, line number, type (Function/Class/Module), signature.

### Who calls a function?

```
Tool: analyze_code_relationships
Args: { "query_type": "find_callers", "target": "execute" }
```

### What does a function call?

```
Tool: analyze_code_relationships
Args: { "query_type": "find_callees", "target": "execute", "context": "src/services/task-runner.ts" }
```

Use `context` (file path) to disambiguate when multiple functions share a name.

### Transitive callers/callees

```
Tool: analyze_code_relationships
Args: { "query_type": "find_all_callers", "target": "helper" }
```

```
Tool: analyze_code_relationships
Args: { "query_type": "find_all_callees", "target": "main" }
```

### Call chain between two functions

```
Tool: analyze_code_relationships
Args: { "query_type": "call_chain", "target": "orchestrate->cleanup" }
```

Format: `source->target` (arrow separator).

### Class hierarchy

```
Tool: analyze_code_relationships
Args: { "query_type": "class_hierarchy", "target": "BaseConnector" }
```

Returns: methods, child classes, parent classes.

### Find importers

```
Tool: analyze_code_relationships
Args: { "query_type": "find_importers", "target": "lodash" }
```

### Functions by decorator

```
Tool: analyze_code_relationships
Args: { "query_type": "find_functions_by_decorator", "target": "deprecated" }
```

## Code Quality Analysis

### Complexity hotspots

```
Tool: find_most_complex_functions
Args: { "limit": 10 }
```

### Single function complexity

```
Tool: calculate_cyclomatic_complexity
Args: { "function_name": "processWorkItem" }
```

### Dead code detection

```
Tool: find_dead_code
Args: { "exclude_decorated_with": ["@app.route", "@api_view", "@pytest.fixture"] }
```

**Always exclude known entry-point decorators** — without this, all API endpoints and test fixtures show as "dead."

## Advanced: Cypher Queries

When built-in tools aren't sufficient, use raw Cypher:

```
Tool: execute_cypher_query
Args: { "cypher_query": "MATCH (f:Function) WHERE f.end_line - f.line_number > 30 RETURN f.name, f.path ORDER BY (f.end_line - f.line_number) DESC LIMIT 10" }
```

### Useful Cypher patterns

**Hub functions** (high connectivity — refactoring targets):
```cypher
MATCH (f:Function)
OPTIONAL MATCH (f)-[:CALLS]->(callee:Function)
OPTIONAL MATCH (caller:Function)-[:CALLS]->(f)
WITH f, count(DISTINCT callee) AS out, count(DISTINCT caller) AS in
ORDER BY (out + in) DESC LIMIT 10
RETURN f.name, f.path, in, out
```

**Cross-module calls:**
```cypher
MATCH (caller:Function)-[:CALLS]->(callee:Function)
WHERE caller.path CONTAINS 'services/' AND callee.path CONTAINS 'datasource/'
RETURN caller.name, callee.name
```

**Circular imports:**
```cypher
MATCH (f1:File)-[:IMPORTS]->(m2:Module), (f2:File)-[:IMPORTS]->(m1:Module)
WHERE f1.name = m1.name + '.ts' AND f2.name = m2.name + '.ts'
RETURN f1.name, f2.name
```

**Functions with many args** (possible code smell):
```cypher
MATCH (f:Function) WHERE size(f.args) > 5
RETURN f.name, f.path, size(f.args) AS arg_count ORDER BY arg_count DESC
```

## Graph Model Reference

**Nodes:** `File`, `Function`, `Class`, `Module`, `Import`

**Edges:**
- `(:Function)-[:CALLS]->(:Function)` — call graph
- `(:Class)-[:INHERITS]->(:Class)` — inheritance
- `(:File)-[:CONTAINS]->(:Function|:Class)` — containment
- `(:File)-[:IMPORTS]->(:Module)` — dependency

**Node properties:** `name`, `path`, `line_number`, `end_line`, `args`, `decorators`, `docstring`, `source_code`, `is_dependency`

## Keeping the Graph Fresh

For long-running sessions, watch for changes:

```
Tool: monitor_directory
Args: { "path": "/path/to/repo" }
```

Check what's being watched:
```
Tool: list_watched_paths
Args: {}
```

## Supported Languages

Python, TypeScript, JavaScript, Go, Rust, C#, Java, C, C++, Ruby, PHP, Swift, Kotlin, Dart, Perl.

## Limitations

- **AST-only** — no runtime/dynamic dispatch analysis. `eval()`, reflection, and dynamic imports are invisible.
- **No content search** — use text search for strings, comments, log messages.
- **FalkorDB Lite is ephemeral** — graph lives in-process, lost on server restart. Use Neo4j for persistence.
