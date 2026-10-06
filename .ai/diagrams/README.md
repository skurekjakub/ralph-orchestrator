# Diagrams

Orientation maps a fresh agent reads before touching a subsystem: one file per
subsystem at `.ai/diagrams/<subsystem>.md` (Mermaid or ASCII inside
Markdown). A diagram naming a deleted module or a renamed layer is confidently
wrong yet read as ground truth, so the workflows re-verify every path, module,
function and route a touched diagram names before they finish.

- Current state only: no historical framing, branch names or commit SHAs.
- A subsystem that gains a new layer, engine or data-access pattern gets a
  diagram and a row below.

## Reading order

> **Adapt me.** List the diagrams a newcomer should read first.

| Diagram | Subsystem | Read when |
| --- | --- | --- |
