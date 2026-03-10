# Reference File Template

Each generated reference file should describe one meaningful area of the target repository.

## Required Sections

Use this structure unless the repo clearly demands a different one:

```markdown
# <Area title>

One short paragraph explaining what this area is and why it matters.

## Major Paths

| Path | What it contains |
|---|---|
| `./path/...` | ... |

## Key Concepts

- ...
- ...
- ...

## Important Entry Points

| Kind | Path | Why it matters |
|---|---|---|
| ... | `./...` | ... |

## Related Code Roots

| Area | Path |
|---|---|
| ... | `./...` |

## Cross-References

- Related area: `other-reference.md`
- Related area: `another-reference.md`
```

## How To Fill It In

### Opening paragraph

Say what the area owns. Do not start with history or trivia.

### Major Paths

List the directories or files that define the area structurally.

### Key Concepts

Extract the 3 to 7 ideas a new agent needs to orient itself.

Examples:

- runtime responsibility
- data model boundary
- UI or API surface
- build or deployment role
- extension point

### Important Entry Points

Use this section when the area has obvious anchors such as:

- app entrypoints
- package manifests
- setup scripts
- core service directories
- architecture docs

If the area is documentation-only, this can instead point to the main index pages.

### Related Code Roots

Map the area to the implementation roots that back it.

If the area already is the implementation root, keep the mapping simple.
If you cannot identify the backing code confidently, say so instead of guessing.

### Cross-References

Link sibling references that a future agent would naturally need next.

## Tone

Be concrete and navigational.

This file is for orientation, not for exhaustive design documentation.
