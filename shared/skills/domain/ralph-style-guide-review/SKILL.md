---
name: ralph-style-guide-review
description: "Writing standards for self-reviewing Xperience by Kentico documentation before submitting. Use this skill to check written content against the style guide — verify correct UI interaction verbs (select not click), formatting rules (bold for UI elements, backticks for code), tone and voice, sentence structure, and callout box usage. Consult this skill during the review phase of every documentation task."
---

# Style Guide Review Skill

Writing standards for self-reviewing Xperience by Kentico documentation. Use this skill to check your own output against the style guide before submitting.

## Target Audiences

### Business users
**Personas:** Editors, marketers, store managers, designers, marketing owners
- Friendly, positive tone
- One action per step
- No technical jargon (use grandmother-friendly language)
- More screenshots for clarity

### Developers and admins
**Personas:** Developers, web admins, technical executives, product owners
- Can combine 2 related easy steps (e.g., "Select the desired transformation and select **Save**.")
- Use developer terminology appropriately
- Explain business/marketing terms when needed

## Writing Style

**Task-Oriented approach:** Document what users can accomplish (focus on use scenarios), not what specific UI elements do.

**Avoid over-explaining common concepts:** Assume basic familiarity with common tasks unless the audience requires beginner-level guidance.

## Page Structure

### Required elements
1. **Title** - Describes user scenario
2. **Introduction** - What, why, when to use
3. **Body** - Step-by-step instructions
4. **Result** - What user achieves
5. **Next Steps** - Related actions/materials

### Title guidelines
- Use sentence case
- Use existing noun phrases: "Page Builder", "Email Builder", "Installation"
- For scenarios, use imperative verbs: "Configure your application"
- Don't use "How to" prefixes
- Optimize for search
- Must be unique and unambiguous

### Introduction
- Describe what the article covers and how it benefits the user
- Provide real-world scenarios when possible
- Make content scannable

### Body guidelines
- Assume a happy path — user has proper permissions and correct project setup
- Use ordered lists for step-by-step instructions
- Use bullet points when order doesn't matter
- Write one action per step (don't combine multiple actions)
- Use imperative mood with strong modal verbs

## Language Rules

### Core principles
- **Keep it simple** - Be concise, focus on essentials
- **Get to the point fast** - Lead with what's important
- **Be direct** - "Use the Title field" not "The Title field will let you"
- **Present tense** - Use present simple
- **Active voice** - Clearer and easier to read
- **American English** - "color" not "colour"
- **Consistency** - Same term every time
- **Avoid pronoun "it"** - It fogs the real subject
- **Gender-neutral "they"** - Even for singular usage
- **Write short sentences** - Under 20 words when possible

### Interaction verbs

**Use these verbs:**
- **Select** - buttons, checkboxes, dropdowns, radio buttons, items
- **Clear** - checkboxes
- **Enter** - typing/inserting values
- **Open/Close** - applications, UI elements
- **Go to** - tabs, applications, URLs

**Avoid these verbs:**
- Click, Enable/Disable (for UI elements), Check/Uncheck, Type, Choose

**Prefer action-focused instructions:**
- "**Save** the settings" instead of "Select the **Save** button"

### Navigation
- Use arrows for navigation paths: `Settings -> Security -> Users`

### Contractions
- **Use:** it's, you're, that's, don't (creates friendly tone)
- **Avoid:** there'd, it'll, they'd (awkward)
- **Never:** double contractions, noun + verb contractions

## Typography and Formatting

### Code highlighting
**Use** backticks for: API members, configuration keys, methods, namespaces, classes, CLI arguments.
**Don't use** backticks for: database table/column names.
**Never** pluralize code elements directly. Use: "`IUserInfoProvider` classes".

### En dashes and hyphens
- Render en dashes as two ASCII hyphens `--` (not Unicode `–` U+2013)
- Use en dashes for ranges (e.g., "pages 10--20") and parenthetical asides
- Use regular hyphens `-` for compound words (e.g., "role-based")

### UI elements formatting
**Use bold** for: applications, tabs, buttons, fields, dialog names.
- "**Settings** application", "**URLs** tab", "**Save** button"

### Callout boxes (severity order)
1. **tip** - bonus information
2. **info** - additional information, edge cases
3. **note** - important points
4. **warning** - destructive actions, severe consequences

Rules: Always include a title if it makes sense. Don't write "Note" in a note box.

## Common Patterns

- Lead with conditions/circumstances, then instructions: "To delete the entire document, select **Delete**"
- Plural contains singular — don't add (s) at the end of words: "Wait 5 minutes" not "Wait 5 minute(s)"
- Replace long phrases with single words: "because" not "due to the fact that"
- Avoid filler words: `actually`, `basically`, `really`, `just`
