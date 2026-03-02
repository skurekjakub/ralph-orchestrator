# Skill Integration & Deduplication

How to wire new skills into the agent's workflow phases and resolve overlap with existing skills.

## Phase 5: Integrate into Workflow

Skills are useless if the agent doesn't know when to read them. Integration happens at two levels:

### Level 1: Transition lists

Each workflow phase skill has a transition section ("Before moving to Phase N+1") that sets the skill manifest for the next phase. Add new skills here:

```markdown
## Before moving to Phase 3
Update `state.md`:
- Set "Skills for this phase" to:
  - workflow-write
  - documentation-syntax
  - callout-selection
  - page-removal (if removing or deprecating pages)
  - cross-version-linking (if linking across collections)
```

**Rules:**
- Unconditional skills go first (the agent always needs them for this phase)
- Conditional skills use parenthetical qualifiers: `(if creating new pages)`, `(if build is broken)`
- Don't list more than ~6-8 skills per phase — if you need more, some skills might be too granular or some conditions too unlikely to list

### Level 2: Inline references

Within the phase's instructions, mention the skill at the exact decision point where the agent needs it:

```markdown
3. **Validate after every change** — run `npm run build`. If the build fails,
   consult the **build-errors** skill for common error patterns and fixes.
```

This is more effective than just listing the skill in a transition section — it connects the skill to a specific action the agent is performing right now.

### Where each type of skill fits

| Skill type | Primary integration point | Secondary |
|---|---|---|
| Syntax reference | Write/implement phase body | Transition from research phase |
| Error troubleshooting | Validate/build step in write phase | Pre-commit checkpoint |
| Decision guide | Write phase body | Transition from research phase |
| Checklist | Write phase body (conditional) | Transition from research phase |
| Cross-cutting concern | Multiple phase bodies | — |

## Phase 6: Detect and Resolve Overlap

After creating skills, compare each new skill against every existing skill. Read both fully — don't rely on names or descriptions alone.

### Overlap levels

- **Heavy overlap**: Both skills cover the same content with similar depth → merge unique content into the existing skill, delete the new one
- **Moderate overlap**: Shared topic but different depth/angle → merge the unique parts into whichever skill is the natural home, delete the other
- **Minimal overlap**: Brief mention in one, deep coverage in the other → keep both, add a cross-reference from the shallow mention to the deep coverage

### Merge strategy

1. Identify what's unique in the new skill vs the existing one
2. Add the unique content to the existing skill in a natural location — integrate into the existing structure, don't just append
3. Update the existing skill's frontmatter description if the scope expanded
4. Delete the redundant skill directory
5. Remove from profile/skills config
6. Search for **all** references to the deleted skill name across the codebase:
   - Phase skill transition lists ("Skills for this phase")
   - Inline references in phase skill bodies
   - Cross-references in other domain skills
   - Update each to point to the merged target
7. Verify with grep that no dangling references remain

### When NOT to merge

Keep separate skills even with topic overlap when:
- One is a **quick-reference** (syntax lookup) and the other is a **decision guide** (when to use which) — they serve different cognitive needs
- Merging would push the combined skill over ~200 lines — the agent loses focus in very long skills
- The skills target different workflow phases and would create a confusing "read this for phase 3 OR phase 6" situation

## Checklist

- [ ] Workflow decomposed into phase skills with scratchpad contract
- [ ] Target domain explored (build system, conventions, failure modes)
- [ ] All existing skills read and gap analysis complete
- [ ] Candidate skills proposed with overlap risks noted
- [ ] Selected skills created with pushy descriptions and concrete examples
- [ ] Skills integrated at both levels (transition lists + inline references)
- [ ] Overlap detected and resolved (merged or cross-referenced)
- [ ] No dangling references to deleted skills remain
- [ ] Profile/skills config updated with final skill list

## Further reading

- [Building effective agents](https://www.anthropic.com/engineering/building-effective-agents) — Anthropic's orchestration patterns. The "orchestrator-workers" pattern maps directly to phase skills delegating to domain skills.
- [Claude Code best practices: project setup](https://docs.anthropic.com/en/docs/claude-code/best-practices) — How CLAUDE.md and memory files create layered context. Skills extend this with on-demand domain knowledge.
- [Agentic coding best practices](https://docs.github.com/en/copilot/using-github-copilot/best-practices-for-using-github-copilot) — GitHub's guidance on structuring instructions for AI coding assistants.
