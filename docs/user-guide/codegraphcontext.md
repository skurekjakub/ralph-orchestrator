# CodeGraphContext — Best Practices

CodeGraphContext (CGC) indexes source code into a graph database (FalkorDB Lite or Neo4j) using Tree-sitter AST parsing, then exposes structural queries over MCP. This document distills best practices from the official documentation.

## Graph Model

CGC builds a property graph with these node types and relationships:

**Nodes:** `File`, `Function`, `Class`, `Module`, `Import`
**Edges:** `CALLS`, `INHERITS`, `CONTAINS`, `IMPORTS`

Every node carries metadata: `name`, `path`, `line_number`, `end_line`, `args`, `decorators`, `docstring`, `source_code`, `is_dependency`.

## When to Use CGC vs. Text Search

| Use CGC | Use text search |
|---|---|
| Call chains: "what calls `processPayment`?" | String literals, comments, log messages |
| Dead code detection across the whole codebase | Finding TODO/FIXME annotations |
| Class hierarchy traversal | Matching text patterns across file types |
| Complexity hotspot analysis | Files CGC doesn't index (YAML, Markdown, JSON) |
| Cross-module dependency understanding | Quick filename lookups |

**Rule of thumb:** if the question is about *structure* (calls, inheritance, containment, imports), use CGC. If it's about *content* (strings, patterns, comments), use text search.

## Indexing

### Initial Index

```bash
cgc index .            # Index current directory
cgc index /path/to/repo  # Index specific path
```

Indexing is async — use `list_jobs` + `check_job_status` to track progress. For repos >100k LOC, use Neo4j instead of FalkorDB Lite and add `tests/` to `.cgcignore`.

### Incremental Updates

```bash
cgc watch .            # Start watching for changes (background)
```

Or via MCP: call `monitor_directory` with the repo path. Changes are re-indexed automatically. Check watched paths with `list_watched_paths`.

### .cgcignore

Create a `.cgcignore` file (gitignore syntax) to exclude paths from indexing:

```
node_modules/
dist/
.build/
output/
*.min.js
*.generated.ts
```

Always exclude: build output, vendored code, generated files, test fixtures (unless you want to analyze test structure).

## Configuration

Key settings (set via `cgc config set <key> <value>`):

| Setting | Default | Recommendation |
|---|---|---|
| `DEFAULT_BACKEND` | `falkordb` | Keep for repos <100k LOC. Use `neo4j` for larger. |
| `PARALLEL_WORKERS` | `4` | Increase for large repos on beefy machines |
| `MAX_FILE_SIZE_MB` | `5` | Increase only if you have large generated files worth indexing |
| `IGNORE_TESTS` | `false` | Set `true` to skip test directories |
| `INDEX_VARIABLES` | `true` | Keep `true` for full variable tracking |
| `CACHE_ENABLED` | `true` | Keep `true` — skips unchanged files on re-index |
| `ENABLE_AUTO_WATCH` | `false` | Set `true` for long-running dev sessions |

### Database Backend

- **FalkorDB Lite** (default): Zero-config, in-process, works on Linux/macOS/WSL. Requires Python 3.12+. Best for single-repo, local, or CI usage.
- **Neo4j**: Production-grade, multi-repo, survives restarts. Needs `NEO4J_URI`, `NEO4J_USERNAME`, `NEO4J_PASSWORD` in env. Use for repos >100k LOC or shared/persistent indexes.

## MCP Tool Reference

### High-Value Tools

| Tool | When to Use |
|---|---|
| `find_code` | Find any symbol by name — functions, classes, modules |
| `analyze_code_relationships` | Call chains, callers, callees, importers, class hierarchy |
| `find_dead_code` | Unused function detection (use `exclude_decorated_with` for API endpoints) |
| `find_most_complex_functions` | Complexity hotspots — great for refactoring prioritization |
| `execute_cypher_query` | Custom graph queries when built-in tools aren't enough |
| `add_code_to_graph` | Index a directory on demand (triggers async indexing job) |
| `monitor_directory` | Watch a directory for changes — keeps graph fresh |

### analyze_code_relationships query types

| `query_type` | Target Format | Example |
|---|---|---|
| `find_callers` | function name | Who calls `helper`? |
| `find_callees` | function name | What does `foo` call? |
| `find_all_callers` | function name | Transitive callers of `helper` |
| `find_all_callees` | function name | Transitive callees of `foo` |
| `call_chain` | `source->target` | Path from `wrapper` to `helper` |
| `find_importers` | module name | Who imports `math`? |
| `class_hierarchy` | class name | Methods + child classes of `Base` |
| `find_functions_by_decorator` | decorator name | All `@app.route` functions |
| `find_functions_by_argument` | argument name | All functions taking `request` |
| `overrides` | function name | All overriding implementations |

### find_dead_code

Always pass `exclude_decorated_with` for known entry points:

```json
{
  "exclude_decorated_with": ["@app.route", "@api_view", "@pytest.fixture"]
}
```

Without exclusions, all API endpoints and test fixtures appear as "dead code."

## Useful Cypher Patterns

CGC exposes `execute_cypher_query` for custom graph traversal. Key patterns:

```cypher
// Large functions (refactoring candidates)
MATCH (f:Function)
WHERE f.end_line - f.line_number > 30
RETURN f.name, f.path, (f.end_line - f.line_number) AS lines
ORDER BY lines DESC LIMIT 10

// Hub functions (high fan-in + fan-out)
MATCH (f:Function)
OPTIONAL MATCH (f)-[:CALLS]->(callee:Function)
OPTIONAL MATCH (caller:Function)-[:CALLS]->(f)
WITH f, count(DISTINCT callee) AS out, count(DISTINCT caller) AS in
ORDER BY (out + in) DESC LIMIT 10
RETURN f.name, f.path, in, out

// Circular file imports
MATCH (f1:File)-[:IMPORTS]->(m2:Module), (f2:File)-[:IMPORTS]->(m1:Module)
WHERE f1.name = m1.name + '.py' AND f2.name = m2.name + '.py'
RETURN f1.name, f2.name

// Cross-module calls
MATCH (caller:Function)-[:CALLS]->(callee:Function)
WHERE caller.path ENDS WITH 'service.ts' AND callee.path ENDS WITH 'repository.ts'
RETURN caller.name, callee.name

// Functions with many arguments (code smell)
MATCH (f:Function) WHERE size(f.args) > 5
RETURN f.name, f.path, size(f.args) AS arg_count
ORDER BY arg_count DESC
```

## Supported Languages

Python, TypeScript, JavaScript, Go, Rust, C#, Java, C, C++, Ruby, PHP, Swift, Kotlin, Dart, Perl.

TypeScript/JavaScript support covers ESM + CJS imports, classes, arrow functions, and JSX/TSX.

## Limitations

- **No runtime analysis** — CGC parses AST structure, not execution traces. Dynamic dispatch, `eval()`, and runtime metaprogramming are invisible.
- **No string/comment search** — the graph contains structural elements only. Use text search for content queries.
- **FalkorDB Lite is ephemeral** — data lives in-process. Stopping the server loses the graph. Re-index on restart, or use Neo4j for persistence.
- **Cypher dialect varies** — FalkorDB uses a Cypher subset. Some Neo4j-specific syntax may not work. Test queries on your backend.
