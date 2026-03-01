---
name: ralph-training-modules
description: "YAML schema and templates for creating structured training modules and learning paths. Use this skill whenever creating or editing training modules, defining module sequences, writing module introduction or conclusion pages, organizing learning paths, or when the task involves the _modules or _paths directories."
---

# Training Modules Skill

Instructions for creating structured training modules and learning paths for Xperience by Kentico documentation.

## File Structure

### Modules
- **Location**: `src/_documentation/_modules/_modules/{persona}/{module-name}/`
- **Persona folders**: `developer`, `business`, `admin`, `architect`
- **Required files**:
  - `{module-name}.yml` - Module configuration (REQUIRED)
  - Introduction page (optional): `{module-name}.md` or `landing.md`
  - Conclusion page (optional): `{module-name}-learn-more.md` or `conclusion.md`

### Learning Paths
- **Location**: `src/_documentation/_paths/_paths/{path-name}/`
- **Required files**:
  - `{path-name}.yml` - Path configuration
  - `{path-name}.md` or `{path-name}-landing.md` - Landing page

## Module YAML Structure

```yaml
module_title: [Display title - concise, descriptive]
module_description: [One sentence describing what learners will accomplish]
persona: [developer|business|architect]

sequence:
  - page:
      filename: 'landing.md'
  - page:
      identifier: [page_identifier_from_docs]
      collection: [guides|documentation|api]
      exclude: [Section heading to hide]
      frontmatter:
        title: [Custom title for this context]
  - page:
      identifier: [page_identifier]
      collection: guides
      subpages:
        - start: start
          end: [Next heading text]
          slug: [url-friendly-name]
          exclude: [Sections to hide]
          frontmatter:
            title: [Step title]
  - page:
      filename: 'conclusion.md'
```

### Key YAML Properties

**exclude**: Remove sections from linked pages (e.g., "What's next?", "Before you start")
- Can be a string or list of strings
- Must match heading text **EXACTLY** including punctuation
- Always verify the section exists in the target guide before adding to exclude list
- Use `grep_search` or `read_file` to confirm exact heading text

**Common sections to exclude:**
- "What's next?" — navigation to other guides (exclude by default in modules)
- "Before you start" — prerequisites already covered in module intro
- "Set up the project" — setup steps when learner already has environment

**subpages**: Break a long guide into discrete learning steps
- `start`: Beginning heading (use "start" for page beginning)
- `end`: Ending heading (use "end" for page end)
- `slug`: URL segment for this step

**frontmatter**: Override metadata from the source page
- `title`: Most common — rename page for module context

## Module Introduction Page

Module introduction pages should **NOT** link to pages within the same module. The module sequence itself provides navigation.

### Developer/Technical Modules

```markdown
---
title: [Introduction to {topic}]
identifier: [{module_name}_landing_modules]
license: 1
---

This module [what it covers and why it matters].

### Prerequisites

- Familiarity with [list technologies]
- A running instance of Xperience by Kentico
- [Other specific requirements]
```

### Business/Marketing Modules

```markdown
---
title: [Engaging action-oriented title]
license: 1
---

[Hook paragraph - why this matters to their work]

In this module, you'll learn how to:
{% raw %}
{% info icon=false %}
- [Key outcome 1]
- [Key outcome 2]
- [Key outcome 3]
{% endinfo %}
```

## Module Conclusion Page

### Developer/Technical Modules

```markdown
---
title: Learn more about {topic}
identifier: [learn_more_{module_name}_modules]
license: 1
---

You've reached the end of the **{Module title}** module, with [summary of accomplishments].

The following resources should provide a good starting point for further learning:

- {% page_link "identifier" collection="documentation" %}

## How did you like this series?

We hope you have enjoyed this module about *{topic}* in Xperience by Kentico.

Was there any part of this module that you found confusing, or any missing subjects that you think we should cover? Share your thoughts by clicking the **Send us feedback** button at the end of this page.
```

### Business/Marketing Modules

```markdown
---
title: [Encouraging completion message]
license: 1
---

[Congratulations paragraph]

Here's a quick recap of what you learned in this module. You now can:

{% key %}
- [Key skill/outcome 1]
- [Key skill/outcome 2]
- [Key skill/outcome 3]
{% endkey %}
```
{% endraw %}