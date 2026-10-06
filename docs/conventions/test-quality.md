# Test quality

> **Adapt me.** `rubber-duk-tests` writes and audits unit/integration tests
> against this file. The principles are stack-neutral; add your runner's
> specifics to `stack-profile.md` § Unit tests.

**North-star: would this test fail if the code under test were broken?** If you
can invert the unit's logic — flip a comparison, drop a branch, return the
input unchanged — and the test stays green, it is theater. This outranks every
principle below.

## P1 — Behaviour over implementation

- **Required pattern:** assert observable output: the return value, the
  rendered text, the HTTP response, the file written.
- **Forbidden pattern:** asserting call counts or internal state when an
  output exists. UI tests query by role, label or text — never class names or
  internal ids.

## P2 — Mock only at boundaries

- **Required pattern:** fake the network, filesystem, clock, randomness and
  framework request context — prefer in-memory fakes to mock functions.
- **Forbidden pattern:** mocking the unit under test or its internal helpers.
  A test made only of `toHaveBeenCalledWith` tested the wiring, not the
  behaviour. If a unit can't be tested without mocking its internals, the
  design is too coupled — say so.

## P3 — No brittle assertions

- **Forbidden pattern:** asserting configuration values, whole-DOM or
  whole-string snapshots as the primary assertion, class names, styles or
  colour literals, real dates, absolute paths, or hash/map iteration order.

## P4 — Mutation-resistant

- **Forbidden as the *only* assertion:** `toBeDefined`, `toBeTruthy`,
  `not.toThrow`, `toHaveLength(n)` on a shape, `typeof x === 'function'`.
- **Required pattern:** a bare "it throws" only when throwing is the whole
  contract — and then assert the error type or message.
- **Required practice:** when writing a test, break the code on purpose and
  watch the test go red before you trust it.

## P5 — Isolated and deterministic

- **Forbidden pattern:** shared mutable state without reset, order-dependent
  tests, the real clock, live network, fixtures read from live data trees
  (the template lint tests in `tests/container/` that render the shipped
  templates are the deliberate exception — see `test-layout.md`).
- **Required pattern:** fake timers for time, frozen fixtures, cleanup of temp
  directories in an `afterEach`.

## P6 — Hygiene

- Arrange / Act / Assert, labelled (see `comment-policy.md` § Tests).
- One behaviour per test; the name describes that behaviour.
- No leftover `.only` / `.skip`.

## Severity (for audits)

| Severity | Meaning |
|---|---|
| BLOCKER | False confidence: green while the code is broken, or verifies mocks instead of code |
| IMPORTANT | P1, P2, P3 or P5 violated |
| NIT | P6 |
