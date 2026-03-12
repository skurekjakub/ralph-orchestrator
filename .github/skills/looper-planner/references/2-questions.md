# Phase 2: Questions (Iterating)

## Before you begin

1. Read `state.md` — verify this is Phase 2
2. Review completed phases for context from Phase 1
3. Check the "Question Rounds" section — if resuming, pick up where you left off

## Instructions

This phase **iterates**. You ask questions, the user answers, you assess whether ambiguities remain, and ask more if needed. There is no fixed number of rounds — continue until all meaningful ambiguities are resolved.

### Each question round

#### 1. Formulate questions

Create **10-15 questions for round 1**, or **5-10 for subsequent rounds**.

Guidelines for good questions:
- **Specific and focused** — not vague or too broad
- **Prioritized** — most critical first
- **Context-informed** — based on Phase 1 research and previous answers
- **Ambiguity-hunting** — designed to uncover gaps, edge cases, contradictions
- **Grouped by theme**

Format:

```
## Clarifying Questions (Round N)

### Functional Requirements
1. [Specific question about feature behavior]
2. [Question about edge case handling]

### Technical Constraints
3. [Question about performance requirements]
4. [Question about compatibility needs]

### Integration & Dependencies
5. [Question about existing systems]
```

Theme categories to cover (as relevant):
- Functional requirements and edge cases
- Non-functional requirements (performance, security)
- Integration points and dependencies
- User experience and interface considerations
- Constraints and assumptions

#### 2. Wait for answers

**MANDATORY: Stop and wait for the user to respond.** Do NOT proceed without answers.

#### 3. Assess completeness

After receiving answers:
- Analyze responses critically
- Identify remaining gaps, contradictions, or areas needing deeper exploration
- Optionally use search/read tools to explore code based on new information
- Decide: are there still meaningful ambiguities that would affect specification quality?

If **YES** → start another question round (go to step 1)
If **NO** → proceed to Phase 3

Follow-up questions (round 2+) should:
- Build on previous answers
- Probe deeper into technical implementation details
- Clarify contradictions or ambiguities from earlier rounds
- Validate assumptions about existing code/systems
- Confirm edge cases and error handling strategies

#### 4. Update state between rounds

After each round, update `state.md`:
- Increment "Round" counter
- Update "Unresolved" with remaining ambiguities
- Add any key decisions to "Key Decisions"

## Before moving to Phase 3

Update `state.md`:
- Set "Current Phase" to `Phase 3: Specification`
- Set "Reference file for this phase" to:
  - `references/3-spec.md` from the `looper-planner` skill
- Add Phase 2 to "Completed Phases" with the number of rounds and key themes resolved
- Set "Unresolved" to "None" (or note any accepted unknowns)
