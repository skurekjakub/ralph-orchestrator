# Spec review: the claims to falsify

Read this in Phase 2.5, when writing the reviewer mandates. Refactor specs lean
on structural claims that feel obvious and are cheap to get wrong — a wrong
premise caught here costs a spec edit, caught in Phase 6 it costs a rewrite of
shipped code. Ask each reviewer to **enumerate the spec's load-bearing claims
and confirm or refute each with `file:line` evidence** — not to opine on the
design.

The claims worth naming explicitly:

- **That a type derived one way is identical to the type derived the other
  way.** `z.infer` of an optional field is not `NonNullable<X['field']>` —
  this class of bug does not surface until the move is half done.
- **That a proposed destination matches an existing convention.** The
  convention doc itself may be stale; verify against the code it describes,
  not against the prose.
- **That a cycle exists, or would be created.** A module cycle is a loop
  between specific modules (`a/x → b/y → a/z`); a directory-level back-edge is
  not a cycle and the checker will not report it. "This would create a cycle"
  is a claim about named modules — find the loop or drop the claim.
- **That the inventory counts are right.** Re-derive at least one count
  independently rather than trusting the spec's arithmetic.
- **That no client-reachable module takes a value import of something
  moving.** A type-only import is erased and safe; a value import that
  survives the move into a client-reachable path is not.

One claim a reviewer must not make: **that a function has to stay
synchronous.** Async flips are expected under
`.ai/agent-working-rules.md` § Design rulings (async-first) — reviewers must flag
proposed sync escape hatches instead of defending the sync signature.
