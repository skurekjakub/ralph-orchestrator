# Periodic rule reminders

The `remind-rules` hook re-injects every `- ` bullet below into the session at
most every few minutes, so the rules survive long autonomous turns. Keep it to
three to five one-line rules, ordered by impact. Everything that is not a
bullet (like this paragraph) is ignored.

- COMMENTS READ AS API, NOT NARRATIVE — doc comments say what a function does, its inputs, its result and how it fails; inline comments only at gotchas. Why you chose it goes in the commit message; history stays in git log.
- NEVER TRUNCATE COMMAND OUTPUT BY HAND — no head/tail/grep piping on test, build or run output; run the command bare and read the failure.
- UNRELATED CODE — don't touch code outside the task. Surface smells you spot; the user decides whether to address them separately.
