# Operational Rules — Romantic Fantasy Writer

## Purpose

Non-negotiable operational rules for every agent in the romantic-fantasy-writer system. These rules are universal — they apply to the guide, orchestrator, coordinators, sub-coordinators, and all 46 specialists equally.

## Rule 1: Never Fabricate Tool Output

If a tool call fails or returns unexpected results, report the failure honestly. Never pretend a file was read successfully when it wasn't, never fabricate artifact contents, and never claim a file was written when it failed.

**In creative writing context**: If you're asked to read `world-bible/geography.json` and it doesn't exist, do NOT invent geography details from nothing. Write `blocked` with a clear explanation.

## Rule 2: Always Verify Before Claiming Completion

Before writing `status.json` with `result: "completed"`:
- Verify every artifact you were supposed to write actually exists and contains valid JSON/Markdown
- Verify every required field in your output artifacts is populated
- Verify your output is internally consistent (e.g., character names in dialogue match character profiles)

## Rule 3: Follow Write Protocols Exactly

| Protocol | Rule |
|----------|------|
| `create-once` | Check that the file does NOT exist before writing. If it exists, you are in a retry — read the auditor feedback and write an improved version. |
| `read-modify-write` | Read the current state, modify only your section, write back. Never overwrite fields owned by other agents. |
| `prepend-entry` | Read the array, prepend your entry at index 0, write back. Never remove existing entries. |

## Rule 4: Respect Artifact Ownership

Each artifact has designated writers. Only write artifacts assigned to your agent:
- `story-concept.json` → concept-developer only
- `world-bible/geography.json` → geography-builder only
- `progress.json` → orchestrator only
- `continuity/continuity-tracker.json` → continuity-tracker only

If you discover you need to update an artifact not assigned to you, write a note in your status.json summary — never write the artifact directly.

## Rule 5: Status Is the Last Thing You Write

Your `agents/{your-name}/status.json` is the signal that triggers the next routing decision. If you write it before your output artifacts are complete, the coordinator may dispatch the next agent before your work is available. Always write status.json as the very last file operation.

## Rule 6: Respect Convergence Bounds

- **maxAuditorRetries (3)**: If you're an auditor on your 4th invocation for the same phase, the system is at its limit. Be rigorous but fair — don't fail on stylistic preferences when core invariants pass.
- **maxRevisionBetaCycles (2)**: Beta readers should focus on critical issues, not polish-level concerns. By cycle 2, only `critical` and `high` severity items should trigger `revision-required`.
- **maxChaptersBeforeCheckpoint (5)**: After 5 chapters, expect a continuity checkpoint.

## Rule 7: Creative Invariants Are Non-Negotiable

These invariants must never be violated, regardless of context:
- **INV-001**: Both fantasy and romance arcs must be present in every story
- **INV-002**: No internal consistency contradictions across any artifacts
- **INV-003**: Each POV character must have a distinct voice
- **INV-005**: Show don't tell — emotions through physical sensation and action
- **INV-009**: No deus ex machina — solutions use established abilities only
- **INV-012**: Sequential chapter drafting — chapter N+1 cannot start until N completes
- **INV-023**: Zero tolerance for plagiarism

## Rule 8: Auditor Independence

Auditors must form independent judgments. They read the artifacts and the invariant checklist, then render a verdict. They do NOT read previous audit reports to avoid confirmation bias. Each audit is a fresh evaluation.

Exception: On retry (iteration > 1), auditors DO read the previous audit's findings to verify that specific flagged issues were addressed.

## Rule 9: Handle Missing Optional Inputs Gracefully

Some story-config fields are optional (`mood`, `characterSketches`, `worldFragments`, `styleSamples`). If these are null:
- Proceed with defaults or creative inference
- Never block on optional inputs
- Document in your summary what defaults were used

## Rule 10: Manifest Entries Are Mandatory

Every agent must prepend an entry to `manifest.json` after completing work. The entry includes agent name, action taken, artifacts written, and timestamp. This creates the complete audit trail for the entire story production.
