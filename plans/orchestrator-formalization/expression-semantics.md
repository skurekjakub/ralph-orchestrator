# EFSM Expression Semantics — `docwriter-efsm-v1`

Formal specification of the guard language, action semantics, and structural
constructs used by the docwriter family state machines.

---

## 1. Computational Model

**Extended Finite State Machine (EFSM)** — a finite automaton augmented with:

- **Bounded variables** (counters with min/max, enums with fixed value sets, booleans)
- **Guards** on transitions (boolean predicates over variables and input)
- **Actions** on transitions (variable mutations and side-effect declarations)
- **Parameterized input** (input symbols carry structured payloads via `$input.*`)
- **Fork states** (product states for bounded parallel dispatch)
- **Foreach** (bounded iteration with an embedded sub-machine per item)
- **Modes** (alternative entry points into the same machine)
- **Terminal output** (structured payloads emitted to the parent machine)

The model remains **finite-state** — all variable domains are bounded, all loops
have hard caps, and foreach iterates over a finite collection. No recursion, no
stack, no unbounded memory. Every machine is guaranteed to terminate.

---

## 2. Type System

### 2.1 Variable Types

| Type      | Domain                        | Operations                    |
|-----------|-------------------------------|-------------------------------|
| `counter` | Integer in `[min, max]`       | `increment`, `set`, compare   |
| `enum`    | One of `values[]`             | `set`, `==`, `!=`             |
| `boolean` | `true` \| `false`             | `set`, `==`, `!=`, logical    |

All variables MUST declare their domain at definition time. There is no dynamic
allocation and no string type.

### 2.2 Input Symbols

Input symbols are **string literals** from a fixed alphabet per machine. Each
machine declares its accepted symbols implicitly through its transition `on`
fields. The union of all `on` values across all transitions forms the input
alphabet Σ.

Input symbols may carry **structured payloads** accessed via `$input.<field>`.
Payload fields are read-only and scoped to the current transition evaluation.

### 2.3 Slot Status (fork states)

Fork slots have an implicit status variable with domain `{pending, done, error}`.
Referenced as `slot.<name>` in guards.

---

## 3. Guard Language

Guards are boolean predicates attached to transitions. When multiple transitions
share the same `(from, on)` pair, guards determine which fires. Guards MUST be
mutually exclusive for the same `(from, on)` — ambiguity is a schema error.

### 3.1 Grammar

```
guard     ::= expr
expr      ::= compare
            | expr '&&' expr
            | expr '||' expr
            | '(' expr ')'

compare   ::= operand '==' operand
            | operand '!=' operand
            | operand '<'  operand
            | operand '<=' operand
            | operand '>'  operand
            | operand '>=' operand

operand   ::= variable          -- machine variable name
            | '$input.' field   -- input payload field
            | slot_ref          -- fork slot status
            | literal

variable  ::= identifier        -- must match a declared variable name

slot_ref  ::= 'slot.' identifier

literal   ::= integer           -- e.g. 3, 0
            | string            -- e.g. done, none, P2  (unquoted enum values)
            | 'true' | 'false'

field     ::= identifier ('.' identifier)*
```

### 3.2 Operator Precedence (highest first)

1. Comparison operators: `==`, `!=`, `<`, `<=`, `>`, `>=`
2. Logical AND: `&&`
3. Logical OR: `||`
4. Parentheses override precedence

### 3.3 Evaluation Rules

- Guards are evaluated **after** the input symbol matches — a transition is a
  candidate only if its `on` field matches the current input.
- `$input.<field>` resolves to the payload of the current input event. If the
  field is absent, the expression evaluates to `undefined` and any comparison
  against it returns `false`.
- `slot.<name>` resolves to the current status (`done` | `error` | `pending`)
  of the named slot within the enclosing fork state. Only valid inside
  transitions originating from a `fork` state.
- Type checking: comparing values of different types is a static error.
  `counter` values compare against integer literals only. `enum` values compare
  against their declared value set only.

### 3.4 Examples

```
cycle < 3
cycle >= 3
reentryTarget == none
slot.code == done && (slot.research == done || slot.research == error)
$input.cyclesCompleted < 3
pass2_analysis == done && pass3_planning != done
attempt < 3
```

---

## 4. Action Semantics

Actions execute **after** a transition fires (guard passed) and **before**
entering the target state. Actions execute in declaration order (array index).

### 4.1 Action Types

#### `set` — Assign a value to a variable

```json
{ "set": "<variable>", "value": <literal> | "$input.<field>" }
```

```yaml
- set: reentryTarget
  value: $input.target
```

- Value MUST be within the variable's declared domain.
- `$input.<field>` resolves the field from the current input payload.

#### `increment` — Bump a counter by 1

```json
{ "increment": "<counter-variable>" }
```

```yaml
- increment: attempt
```

- Target MUST be a `counter` type variable.
- If `current + 1 > max`, the increment is a **runtime error** (machine logic
  bug — guards should prevent this). Implementations may treat as a hard error
  or clamp to max.

#### `reset` — Reset variables to their initial values

```json
{ "reset": ["<var1>", "<var2>"] }
```

```yaml
- reset: [attempt, gapRelayed]
```

- Each variable reverts to its declared `initial` value.

#### `cascade` — Reset a range of progress states

```json
{ "cascade": { "from": "<state-or-$ref>", "through": "<state>" } }
```

```yaml
- cascade:
    from: $input.target
    through: P5_6
```

- Resets all pass progress entries from the named state through the target
  state (inclusive) to `not-started`.
- This is an orchestrator-level action that operates on `progress.json`.
- `$input.<field>` references in `from` are resolved at action execution time.
- The cascade range is determined by the linear pass ordering defined in the
  orchestrator's state declarations.

### 4.2 Execution Model

- Actions are **synchronous** and execute atomically with the transition.
- If any action fails (e.g., increment overflow), the transition is aborted
  and the machine enters its ERROR state.
- Actions do NOT produce new input symbols — they mutate state only.

---

## 5. Structural Constructs

### 5.1 States

Every state has a `type` field with one of:

| Type       | Semantics                                                        |
|------------|------------------------------------------------------------------|
| `initial`  | Entry point. Exactly one per machine (or per mode).              |
| `dispatch` | Invoke a child agent and wait for its result symbol.             |
| `fork`     | Invoke multiple child agents; wait for all slots to settle.      |
| `gate`     | Evaluate a prerequisite predicate before proceeding.             |
| `terminal` | Machine halts. Emits `result` to parent machine as input.       |

#### `dispatch` state properties

| Property      | Required | Type    | Meaning                                             |
|---------------|----------|---------|-----------------------------------------------------|
| `dispatch`    | yes      | string  | Agent name to invoke                                |
| `pass`        | no       | number  | Pipeline pass number (documentation only)           |
| `nonBlocking` | no       | bool    | If true, `error` input continues rather than halts  |

#### `fork` state properties

| Property | Required | Type   | Meaning                                              |
|----------|----------|--------|------------------------------------------------------|
| `slots`  | yes      | object | Map of slot name → `{ dispatch, nonBlocking? }`     |
| `pass`   | no       | number | Pipeline pass number                                 |

All slots are dispatched. The fork emits `fork-complete` when all slots have
reached a terminal status (`done` or `error`). Guards on `fork-complete`
transitions inspect `slot.<name>` to determine the path.

#### `gate` state properties

| Property   | Required | Type   | Meaning                                            |
|------------|----------|--------|----------------------------------------------------|
| `requires` | yes      | string | Guard expression evaluated against runtime context |

Emits `gate-passed` if the expression is true, `gate-failed` otherwise.

#### `terminal` state properties

| Property | Required | Type   | Meaning                                             |
|----------|----------|--------|-----------------------------------------------------|
| `result` | yes      | string | Symbol emitted to the parent machine                |
| `output` | no       | object | Structured payload accompanying the result symbol   |

`output` values may reference `$<source>.<field>` to extract data from child
agent status files at terminal-emission time.

### 5.2 Modes

Modes define alternative entry points into the same machine. The parent machine
determines the mode by context (e.g., which pass is currently active).

```yaml
modes:
  pass2:
    when: <guard-expression>
    entry: <state-id>
  pass3:
    when: <guard-expression>
    entry: <state-id>
```

- `when` expressions are evaluated against the shared progress context (e.g.,
  `progress.json` fields).
- Modes MUST be mutually exclusive — if two `when` guards can be simultaneously
  true, it is a schema error.
- Each mode's `entry` MUST reference a state declared in the same machine.

### 5.3 Foreach

Foreach defines bounded iteration over a data-driven collection with an
embedded sub-machine executed per item.

```yaml
foreach:
  collection: <data-source>
  filter: <predicate>
  order: <ordering-spec>
  itemVariable: <name>
  eligibility: <predicate>
  itemMachine: { ... }
  completionState: <state-id>
```

| Field             | Required | Meaning                                              |
|-------------------|----------|------------------------------------------------------|
| `collection`      | yes      | Data source (artifact file path)                     |
| `filter`          | no       | Predicate selecting items from the collection        |
| `order`           | no       | Iteration order specification                        |
| `itemVariable`    | yes      | Name binding for the current item in sub-expressions |
| `eligibility`     | no       | Per-item guard — item is skipped until this is true  |
| `itemMachine`     | yes      | Complete EFSM executed for each eligible item        |
| `completionState` | yes      | State to enter when all items have terminated        |

The outer machine transitions to `completionState` when every item in the
(filtered) collection has reached a terminal state in its sub-machine.

**Boundedness guarantee:** The collection is finite (it's read from a file).
The sub-machine terminates (all its loops have counter bounds). Therefore the
foreach terminates.

**`eligibility`** is a special predicate re-evaluated before each item
iteration. Items whose eligibility is not yet met are deferred (not skipped
permanently). This models dependency ordering — an item becomes eligible when
its dependencies are satisfied.

### 5.4 Transitions

```yaml
- from: <state-id>
  to: <state-id> | { switch: <expr>, cases: { ... } }
  on: <symbol> | [<symbol>, ...]
  guard: <predicate>        # optional
  actions: [...]            # optional
  comment: <string>         # optional, documentation only
```

#### Transition Resolution

When a state receives input:

1. Collect all transitions where `from` matches the current state AND `on`
   matches (or includes) the input symbol.
2. Among candidates, evaluate `guard` expressions. Exactly one MUST pass
   (mutual exclusivity requirement).
3. If no candidate matches → **runtime error** (unhandled input).
4. Execute `actions` in order.
5. Resolve `to`:
   - If `to` is a string → transition to that state.
   - If `to` is a `switch` → evaluate the switch expression, look up the
     result in `cases`, transition to the matched state.

#### Dynamic Target (`switch`)

```yaml
to:
  switch: $input.target
  cases:
    P2: P2
    P3: P3
    P4: P4
    P5_6: P5_6
```

The switch expression is evaluated, and its value is looked up in the cases
map. If no case matches → **runtime error**. This is the mechanism for
parameterized transitions (e.g., re-entry to a variable target pass).

---

## 6. `$`-Reference Semantics

All `$`-prefixed identifiers are **read-only references** resolved at
evaluation time. They are NOT variables — they cannot be mutated by actions.

| Prefix          | Scope                     | Example                      |
|-----------------|---------------------------|------------------------------|
| `$input.<f>`    | Current input payload     | `$input.target`              |
| `$<agent>.<f>`  | Agent status file field   | `$gapHunter.reEntryTarget`   |
| `slot.<s>`      | Fork slot status          | `slot.code`                  |

`$input` is only valid within garde/actions of a transition.
`$<agent>` is only valid within `output` fields of terminal states.
`slot` is only valid in guards on `fork-complete` transitions.

---

## 7. Composition — Parent-Child Protocol

Machines compose hierarchically:

1. **Parent** dispatches a child by entering a `dispatch` or `fork` state.
2. **Child** executes its machine to completion → reaches a `terminal` state.
3. Child's `terminal.result` becomes the **input symbol** to the parent's
   current state.
4. If the terminal has `output`, the payload is accessible via `$input.*`
   in the parent's transition guard/actions.

This is a **synchronous call** — the parent blocks until the child terminates.
There is no asynchronous message passing.

**Depth limit:** The hierarchy has exactly 3 tiers:
- Tier 0: Orchestrator (1 machine)
- Tier 1: Coordinators (6 machines)
- Tier 2: Specialists (22 leaf agents — pure functions, no machine needed)

Tier 2 agents have no routing logic. Their behavior is defined entirely by
their agent markdown file. Their output is a result symbol + status file.

---

## 8. Determinism & Termination Properties

### 8.1 Determinism

For any `(state, input)` pair, at most one transition fires. This is enforced
by requiring guards on same-`(from, on)` transitions to be **mutually
exclusive**. Violation is a static schema error, detectable at load time.

### 8.2 Termination

Every machine terminates because:

1. **Counter-guarded loops**: Every backward edge (re-entry, retry) increments
   a bounded counter and is guarded by `counter < max`.
2. **Foreach over finite data**: The collection is read from a fixed file.
3. **No recursion**: Machines cannot invoke themselves.
4. **Fork convergence**: All fork slots must reach terminal status.

### 8.3 Error Totality

Every non-terminal state MUST have a transition on `error` (either to an
ERROR state or onward if `nonBlocking`). No unhandled-input holes.

---

## 9. JSON vs YAML — Encoding Notes

The schema is encoding-agnostic. Both JSON and YAML represent the same
abstract structure. Differences are purely syntactic:

| Aspect                  | JSON                              | YAML                           |
|-------------------------|-----------------------------------|--------------------------------|
| Comments                | `"comment"` field on transitions  | `#` inline comments + `comment` field |
| Multi-line guards       | Single string with escapes        | Folded scalar `>-`             |
| Array-of-one shorthand  | `"on": "done"` or `"on": ["done"]` | `on: done` or `on: [done]`  |
| Readability             | More verbose, stricter syntax     | More compact, indentation-sensitive |
| Machine parseability    | Native `JSON.parse()`             | Requires YAML parser           |
| Agent parseability      | LLMs handle both equally well     | Slightly more natural to read  |

**Recommendation criteria:**
- If programmatic validation/tooling is planned → JSON (no parser dependency)
- If human/LLM readability is priority → YAML (less noise)
- If both → YAML as source of truth, JSON generated for tooling

---

## 10. Open Design Points

### 10.1 Directive Overrides

Directives mutate the machine at runtime (skip passes, force convergence, skip
reviewers). Two candidate approaches:

**A. Pre-processing prune** — before execution, apply directive rules to produce
a modified machine (remove states, short-circuit transitions). The executing
agent sees a clean, already-modified machine.

**B. Inline override section** — add a `directives` section to the schema:

```yaml
directives:
  - match: { state: P0 }
    action: skip             # treat as already-done
  - match: { state: STYLE_REV }
    action: auto-approve     # transition as if "approved"
  - match: { on: needs-reentry }
    action: force-converge   # override to converged
```

### 10.2 Persistence Mapping

Should the schema declare how states map to `progress.json` fields?

```yaml
persistence:
  P0:   progress.pass0_knowledgeCuration
  P1:   progress.pass1_discovery
  P2:   progress.pass2_analysis
  P3:   progress.pass3_planning
  ...
```

This would make crash recovery machine-readable — on restart, load
`progress.json`, map field values to states, and resume from the latest
non-done state.

### 10.3 Foreach Eligibility Expression Power

The current `eligibility` field uses a JS-like expression
(`task.dependsOn.every(d => d.status == written)`). This is more expressive
than the guard language. Options:
- Restrict to the same guard grammar (may not cover dependency checking)
- Allow a richer "collection predicate" sublanguage for foreach only
- Keep it as a natural-language hint that the agent interprets

---

## 11. Schema Version

`$schema: docwriter-efsm-v1`

Future versions would increment: `v2`, `v3`, etc. Breaking changes require
a version bump. Non-breaking additions (new optional fields) do not.
