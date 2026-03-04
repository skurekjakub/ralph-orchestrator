# Agent Prompt Authoring Guide

How to structure agent prompts in this project — what to inline, what to defer, and when to switch.

## Current Architecture

Agent templates live in `profiles/<id>/agents/` as `.agent.md` files. They use Liquid syntax (`{% render 'name' %}`, `{% if isRevision %}`) with partials from `shared/agent-includes/*.md`. Templates are rendered JIT before each task by `AgentTemplateRenderer`, which receives a pre-built `TemplateContext` containing profile metadata, JIRA issue data (key, summary, description, status, type, priority, labels, components, project, created, updated), trigger metadata (`commentTrigger`, `triggerParams`), and runtime flags. The `triggerParams` enables runtime parameterization of agent behavior — see [docs/agent-templates.md](docs/agent-templates.md) for the full parameter reference. Resolved files go to `.build/` and are mounted read-only into containers.

The agent receives the fully resolved prompt as its system instructions. All includes are baked in before the CLI is invoked.

## Inline vs. Deferred Loading

### Inline (Current Default)

All instructions — API references, output formats, security rules — are resolved into the prompt at startup. The agent sees everything from token zero.

**Pros:**
- Single source of truth — no "agent forgot to read the file" failures
- Simpler debugging — `cat .build/malph.agent.md` shows exactly what the agent received
- No wasted tool calls on file reads
- Works with prompt caching (static prefix stays unchanged across runs)

**Cons:**
- Every include grows the system prompt permanently
- Material in the middle of long prompts gets lower recall (the "lost in the middle" effect)
- Content relevant to one phase sits idle through all other phases

### Deferred Loading

The prompt contains only workflow phases and identity. API references and domain knowledge are stored as files the agent reads on demand via `cat` or tool calls.

**Pros:**
- Context window stays lean — agent loads reference material when it needs it
- Each phase gets focused attention without noise from irrelevant sections
- Scales better as the number of includes grows

**Cons:**
- Agent may skip or forget the file read instruction
- Each file read consumes a tool call (adds latency, uses tokens for the tool call overhead)
- Harder to debug — prompt alone doesn't show what the agent saw
- Doesn't benefit from prompt caching (content varies per read)

## Decision Framework

### Always Inline

| Content Type | Reason |
|---|---|
| Identity and personality | Defines core behavior, referenced throughout |
| Workflow phases | Sequential instructions the agent follows every run |
| Prompt security rules | Must be in system prompt — deferred loading is vulnerable to prompt injection preventing the read |
| Tiny references (< 100 words) | Not worth a file read for a few lines |
| Content referenced in 3+ phases | Rereading wastes more tokens than inlining once |

### Candidates for Deferred Loading

| Content Type | Reason |
|---|---|
| API references (JIRA, ADO) | Only needed at specific phases, contain verbose curl examples |
| Style guide file listings | Agent reads the actual files anyway; the listing is a pointer |
| Output format templates | Only relevant at the delivery phase |

### Threshold

**Under ~5K tokens (resolved prompt):** Inline everything. The lost-in-the-middle effect doesn't meaningfully apply at this scale. Operational simplicity wins.

**5K–8K tokens:** Monitor for adherence drops. If the agent starts missing instructions from mid-prompt sections (especially API auth patterns or output formatting), extract single-phase references to deferred files.

**Over ~8K tokens:** Actively extract API references and output templates into mounted files. Add explicit "Read `resources/<file>.md` now" instructions at the relevant phases.

## How to Implement Deferred Loading

When a section is deferred, replace the include marker with a read instruction in the relevant phase:

```markdown
### Phase 6.5: Post Review to ADO PR

Read the ADO API reference before proceeding:
\`\`\`bash
cat resources/ado-api.md
\`\`\`

Then post your findings...
```

The reference file must be mounted into the container via the compose file's volume mounts. The `resources/` directory in each profile is already mounted.

## Literature Summary

These findings inform the framework above:

### Lost in the Middle (Liu et al., 2023)

Models recall information best at the **beginning and end** of the context window. Material in the middle degrades significantly, even for explicitly long-context models. This is the core argument for keeping system prompts lean and loading reference material at point of use.

### Anthropic Long Context Tips

Official guidance: "Put longform data at the top, queries at the end. This can improve response quality by up to 30%." If inlining, structure the prompt with reference docs first and workflow instructions last. Hard to maintain when includes are interleaved throughout phases.

### Claude Code — CLAUDE.md vs. Skills

Claude Code explicitly distinguishes always-loaded context (CLAUDE.md) from on-demand context (Skills). Their guidance:

> "CLAUDE.md is loaded every session, so only include things that apply broadly. For domain knowledge or workflows that are only relevant sometimes, use skills instead."

> "If your CLAUDE.md is too long, Claude ignores half of it because important rules get lost in the noise."

This maps directly to our inline vs. deferred split.

### Prompt Chaining (Anthropic)

"Each subtask gets Claude's full attention, reducing errors." Isolating phases so the agent isn't distracted by irrelevant reference material improves accuracy on complex multi-step workflows. Deferred loading is a lightweight form of prompt chaining within a single session.

### OpenAI Prompt Engineering

"Context is usually best positioned near the end of your prompt." Reference docs should be loaded at point of use, not baked in at the start. Static instructions at the top, dynamic context at the bottom.

## Current Prompt Sizes

| Template | Words | Est. Tokens |
|---|---|---|
| Malph (ralph-docs) | ~2,000 | ~2,700 |
| + All includes | ~3,025 | ~4,000 |
| JIRA API include | ~186 | ~250 |
| ADO API include | ~404 | ~540 |
| ADO PR format | ~77 | ~100 |
| Source references | ~64 | ~85 |
| Prompt security | ~288 | ~385 |

**Status: Well under threshold.** No action needed today. Revisit when resolved prompt exceeds ~6K tokens or when adherence issues are observed.

## Structuring the Prompt When Inlining

If keeping everything inline, optimize ordering for recall:

1. **Identity and personality** (top — highest recall position)
2. **API references** (early — reference docs before instructions)
3. **Workflow phases** (middle — sequential, agent follows step by step)
4. **Review principles and common issues** (end — high recall, acts as reinforcement)
5. **Prompt security** (end — last thing the agent reads before starting)

This follows the "longform data at top, instructions at end" pattern from Anthropic's guidance.

### XML Semantic Boundaries

Use the custom `{% section "name" %}...{% endsection %}` Liquid block tag to wrap each top-level section in XML boundary tags. The rendered output becomes `<name>...</name>`, giving the LLM clear structural delimiters between prompt sections.

**Why:** Claude and other LLMs respect XML boundaries for recall and scope isolation. A `<security>` block is less likely to be confused with a `<workflow>` block, and injection attempts within one section can't easily bleed into another.

**Standard section names:** `agent-identity`, `api-reference`, `security`, `workflow`, `error-handling`, `review-principles`, `target-repository`.

```markdown
{% section "security" %}
{% render 'prompt-security' %}
{% endsection %}

{% section "workflow" %}
## Workflow
### Phase 1: ...
{% endsection %}
```

Multiple sections can share a name (e.g. two `api-reference` blocks for JIRA and ADO). The tag is stateless — each pair is independent.
