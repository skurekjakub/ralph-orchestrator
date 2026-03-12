# Validation Checklist

Run this checklist before considering the generated reference skill complete.

## Coverage

- The router covers the major stable areas of the repository.
- The references are grouped at the right level of granularity.
- Obvious foundational areas are not missing.
- Noise areas were excluded on purpose.

## Consistency

- Reference filenames follow a consistent naming pattern.
- The router link text matches what the references actually cover.
- Similar references use the same section structure.
- Paths are presented in a consistent format.

## Usefulness

- A new agent could tell where to start for each major topic.
- Each reference explains why the area exists, not just what folder names exist.
- Each important area points to the code roots or entrypoints that anchor it.
- Cross-references connect adjacent areas that are likely to be used together.

## Restraint

- The skill does not drown the user in leaf-level detail.
- Generated output, caches, vendor code, and ephemeral content are not treated as core structure unless justified.
- The router stays concise.
- The detailed material lives in `references/`.

## Final Check

If you read only the generated `SKILL.md` and one reference file, you should quickly understand:

- what that area is
- where it lives
- what code roots matter
- what adjacent area to read next

If not, the skill is not ready.
