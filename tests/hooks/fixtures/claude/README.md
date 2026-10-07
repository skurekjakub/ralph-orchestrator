# Claude Code hook payload fixtures

| File                          | Provenance                                                                                                                                                       |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `captured.json`               | Hook stdin captured from Claude Code 2.1.292: `SessionStart`, `UserPromptSubmit`, `StopFailure`, `SessionEnd`                                                    |
| `pre-tool-use-captured.jsonl` | `PreToolUse` stdin captured from Claude Code 2.1.292, one payload per line                                                                                       |
| `hand-written.json`           | Written to the documented hook input shapes, with ids and values taken from captured stream-json and the captured `PreToolUse` payloads; not captured from a run |

Notes on `hand-written.json`:

- `preToolUseSkill` and `preToolUseMcp` belong to session `2b878e7c…`, which no capture contains, and `preToolUseMcp` reuses an `agent_id` that `postToolUseAgent` gives to another agent.
- Replace an entry with a capture when one is taken, and move it to `captured.json`.
