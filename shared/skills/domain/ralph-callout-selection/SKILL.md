---
name: ralph-callout-selection
description: "When to use each admonition type (tip, info, note, warning, key) in the Xperience docs. Use this skill when deciding which callout box to wrap content in — choosing the wrong severity confuses readers and desensitizes them to actual warnings. Covers the semantic meaning of each type and common mistakes."
---
{% raw %}

# Callout Selection Guide

Each admonition type has a specific semantic meaning. Using the wrong one dilutes its impact — if everything is a warning, nothing is.

## Severity ladder (low → high)

### {% tip %} — Helpful shortcut
Optional productivity improvements. The reader's task succeeds without this information.

**Use for:** keyboard shortcuts, time-saving alternatives, "you can also..." suggestions, best practices that aren't required.

```liquid
{% tip %}
You can also use the `dotnet new` CLI to create the project without Visual Studio.
{% endtip %}
```

### {% info %} — Neutral context
Background information that helps understanding. Not actionable — just context.

**Use for:** "this feature was added in version X," explanations of why something works a certain way, links to related topics, definitions.

```liquid
{% info %}
The consent management API uses the GDPR compliance framework introduced in version 28.
{% endinfo %}
```

### {% note %} — Important clarification
Something the reader should know to avoid confusion. Often clarifies a common misconception or an unexpected behavior.

**Use for:** behaviors that differ from expectations, prerequisites that aren't obvious, "this only applies when..." caveats.

```liquid
{% note %}
Workflow transitions are only triggered for pages — not for reusable content items.
{% endnote %}
```

### {% warning %} — Potential problem
Something that could cause real issues if ignored — data loss, broken functionality, security implications.

**Use for:** destructive operations, irreversible actions, known bugs, compatibility breaks, security considerations.

```liquid
{% warning %}
Deleting a content type permanently removes all content items of that type. This action cannot be undone.
{% endwarning %}
```

### {% key %} — Critical / blocking
Absolutely essential information. The reader cannot proceed without this. Use very sparingly.

**Use for:** licensing requirements that block functionality, hard prerequisites, critical security constraints.

```liquid
{% key %}
You must enable the SaaS deployment feature in your license before following these steps.
{% endkey %}
```

## Common mistakes

| Mistake | Fix |
|---------|-----|
| Using **warning** for prerequisites | Use **note** — prerequisites are clarifications, not dangers |
| Using **info** for version requirements | Use **note** if it affects reader's actions, **info** if purely contextual |
| Using **tip** for required steps | If the reader must do it, it's not a tip — put it in the main body |
| Using **note** for "see also" links | Use **info** — it's neutral context, not a clarification |
| Too many callouts on one page | If more than 3-4 per page, some content belongs in the main body |
{% endraw %}
