# Audit Checklist

Run these checks in order.

## 1. Ownership Purity

Ask:

- Does the orchestrator claim to be a pure router?
- If yes, is it still doing substantive researcher, writer, reviewer, scout, scribe, or archive work itself?
- Are any side effects still owned by the wrong agent?

Flag when:

- the orchestrator says "never do X" but later instructs itself to do X
- revision flow quietly reintroduces work that standard flow delegated away

## 2. Routing Contract

Ask:

- Are all declared subagents present in the roster, routing table, and ordering constraints?
- Are all result codes routed?
- Are retry/revision limits consistent across prompt and workflow files?

Flag when:

- a subagent exists in frontmatter but not in routing rules
- the workflow references result codes the subagent never emits
- max-iteration numbers differ across files

## 3. Artifact Contract Alignment

Ask:

- Do prompts match the shared artifact contract?
- Are iterative agents using versioned files consistently?
- Do downstream agents read the same filenames upstream agents are told to write?

Flag when:

- contract says `output-v{N}.md` but prompts still use `output.md`
- a downstream prompt reads a filename no upstream prompt produces

## 4. `status.json` Discipline

Ask:

- Does the orchestrator route only on `status.json`?
- Are there hidden exceptions where it reads full artifacts?

Flag when:

- the orchestrator claims it never reads `output.md` but later reads it anyway
- workflow references require the orchestrator to inspect content instead of routing mechanically

## 5. Standard vs Revision Parity

Ask:

- Does the revision flow preserve the same ownership model?
- Does it reuse the same handoff pattern and delivery agent?

Flag when:

- revision flow bypasses a delegated subagent
- revision flow emits a different artifact or exit-block contract without a matching parser change

## 6. Result-Block Compatibility

Ask:

- Does the workflow print the exact block shape the parser expects?
- Do tests reflect the documented format?

Flag when:

- case, field names, or required keys drift between docs and parser
- revision and standard flows print different structured formats without parser support

## 7. State Source of Truth

Ask:

- Does the workflow say `state.md` is authoritative?
- Are later phases actually maintaining the fields they depend on?

Flag when:

- phases depend on fields never written anywhere
- instructions say "record in handoff" even though handoff is delegated elsewhere

## 8. Skill Mount Integrity

Ask:

- Are all referenced skills mounted in the profile stage?
- Are mounted skills actually referenced directly, referenced transitively by another mounted skill, or intentionally available for opportunistic use?

Transitive check:

- If a mounted skill is not mentioned in any agent prompt, inspect the mounted skills that are mentioned and see whether they explicitly delegate to it.
- Do not classify a skill as stale until both the direct prompt graph and the transitive skill-to-skill graph have been checked.

Flag when:

- prompts require a skill that is not mounted
- profile mounts skills that are unanchored even after the transitive reference check

## 9. Cross-Family Leakage

Ask:

- Does this workflow reference artifacts, scouts, or helpers from a different agent family?

Flag when:

- Ralph reviewers read Malph scout artifacts
- VS Code or docs workflows leak each other's status/output paths

## 10. Duplicate or Stale Side Effects

Ask:

- Is the same external action documented twice?
- Is a handoff/delivery step still present after ownership moved elsewhere?

Flag when:

- release notes or attachments are attached twice
- both orchestrator and scribe are told to post the same comment or archive entry
