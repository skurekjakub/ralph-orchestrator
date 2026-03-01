# Existing Documentation Research

Techniques for exploring the kentico-docs-jekyll documentation site structure during research.

## Documentation Structure

| Path | Contents |
|---|---|
| `src/_documentation/` | All documentation pages (Markdown + Jekyll frontmatter) |
| `src/_guides/` | All guides pages (Markdown + Jekyll frontmatter) |
| `src/_code/src/` | Code examples used in documentation |

## Finding Related Pages

### Start Broad, Then Narrow

1. **Keyword search** — search `src/_documentation/` and `src/_guides/` for terms from the JIRA issue (component names, feature names, API names)
2. **Directory browsing** — list the parent directory of any hit to find sibling pages covering the same feature area
3. **Cross-references** — search for `page_link` tags referencing the pages you found to understand what links to them
4. **Related concepts** -- search for related concepts. The documentation concerns content management concepts. Pages -> linked pages, etc. Orders -> promotions, discounts, shipping. Email marketing -> Emails.

### Frontmatter Inspection

When you find a relevant page, extract these frontmatter fields:
- `title` — display name
- `identifier` — unique ID used in `page_link` tags across the site
- `order` — sort position among siblings (matters when inserting new pages)
- `persona` — target audience (`developer`, `admin`, `business`, `architect`, `all`)
- `redirect_from` — legacy URLs to pages that no longer exist (do not change)

### Identify Coverage Gaps

For every concept in the JIRA issue/instructions handed to you, answer:
- Does a page for this exist? Where?
- Is the existing content accurate and complete?
- Are there sibling pages that cover related concepts? Will the new content overlap or complement them?
- Is the page linked from parent/overview pages, or is it orphaned?

## What to Report

For each relevant page found:
- Full file path
- What it currently covers (brief summary)
- What's accurate vs. outdated vs. missing
- Its position in the nav hierarchy (parent, siblings)

For gaps:
- What's missing and where it should go
- Suggested `order` value relative to siblings
