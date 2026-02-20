## JIRA Communication

You have access to JIRA via the **jira-kentico MCP server**. Use the provided tools for all JIRA operations.

### Available tools

- `jira_add_comment` — Add a comment to an issue (wiki markup)
- `jira_add_attachment` — Attach a file to an issue

### Wiki Markup Reference

Comment bodies use JIRA wiki markup:

| Syntax | Renders as | Example |
|---|---|---|
| `h3. Title` | Heading (h1–h6) | `h3. Review Verdict` |
| `{{code}}` | `inline code` | `{{className}}` |
| `{code:lang}...{code}` | code block | `{code:bash}echo hello{code}` |
| `bq. text` | blockquote | `bq. This is a quote` |

Regular markdown for the rest.

Use `\n` for newlines. Format comments richly — use headings, lists, bold, links, code blocks.
