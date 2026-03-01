---
name: ralph-documentation-syntax
description: "Complete reference for all Liquid tags, formatting, and components available in the Xperience by Kentico Jekyll documentation site. Use this skill whenever writing or editing documentation pages, inserting Liquid tags (admonitions, code blocks, images, page links, tables, columns, cards), adding assets, creating anchors, or using any documentation-specific component. This is the authoritative syntax reference — consult it instead of guessing tag syntax."
---
{% raw %}
# Documentation Syntax Skill

Reference for all Liquid tags, formatting, and components available in the Xperience by Kentico Jekyll documentation site.

## Front Matter

Every page starts with YAML between `---` lines. For the full frontmatter schema (required fields, identifier logic, persona assignment, ordering, licensing), see the **ralph-new-page-creation** skill.

Table of contents via front matter:

```yaml
toc:
  minHeadingLevel: 1
  maxHeadingLevel: 3
  excludeHeadings: ["Install Xperience", "Uncool heading", "/C+/"]
```

## Formatting

- Indentation: 4 spaces, no tabs or 2-space indents.

## Liquid Tags

### Admonitions

- `{% tip %}...{% endtip %}` - Tips and best practices
- `{% info %}...{% endinfo %}` - General information
- `{% note %}...{% endnote %}` - Important notes
- `{% warning %}...{% endwarning %}` - Warnings and cautions
- `{% key %}...{% endkey %}` - Key points
- Option: `icon=false` hides the icon.
- For guidance on choosing the right severity, see the **ralph-callout-selection** skill.

### Code Blocks

**Inline code block** — content directly in the tag:
```liquid
{% code lang=csharp title="Example.cs" highlight="4-7,10" linenumbers=true %}
// code
{% endcode %}
```

- Params: `lang`, `title`, `highlight`, `linenumbers`, `header` (true by default).
- Supported `lang`: bash, bicep, c, css, csharp, cshtml, git, graphql, js, java, json, jsx, html, markdown, nginx, powershell, tsx, regex, sql, typescript, yaml.
- Use `lang=text` for no highlighting.
- If code contains Liquid-like syntax (`{%` or `{{`), wrap the code content with raw/endraw tags to prevent Liquid interpretation.

**Linked code block** — pulls from the CodeSamples project:
```liquid
{% code_link source="CodeSamples/FeatureArea/ClassName.cs" lang=csharp title="Title" id="section-id" exclude="inner" %}
```
- `source` (required) — path relative to `src/_code/src/`
- `lang` (required) — language
- `id` (optional) — extract only the region between `//Include:section-id` and `//EndInclude:section-id` markers in the source file
- `exclude` (optional) — exclude a nested region within the included section
- `title`, `highlight`, `linenumbers` — same as `{% code %}`

### Assets

- Images: `{% image filename.png title="..." width=500 border=true %}`
  - Path: `src/_docsassets/<collection>/<pagefilename>/`.
  - Use `border=true` for UI/screenshot images.
- Files: `{% file filename.pdf linkText="..." disposition=download %}`
  - Path: `src/_docsassets/<collection>/<pagefilename>/`.
  - `disposition`: `download` (default) or `open`.
- Video: `{% video "https://www.youtube.com/embed/ID" height=300 width=500 %}` or `{% video "local.mp4" width=500 %}`
  - YouTube must use `/embed/` URLs.
- Arcade demo: `{% arcade https://demo.arcade.software/ID title="Demo Title" mobile=inline desktop=inline %}`
  - `mobile`, `desktop`: `inline` or `tab`.

### Anchors and Links

- Anchors: `{% anchor my-id %}`
  - ID rules: start with a letter; no whitespace; only ASCII letters, digits, `_`, `-`.
- In-page links: `{% inpage_link my-id linkText="Go" %}`
  - Works only on the current page. For cross-page, use `page_link`.
- Page links: `{% page_link identifier collection="..." linkText="..." anchor="..." target="_blank" suppress_warnings=true %}`
  - `suppress_warnings`: silence warnings for intentional links to older/disabled collections.
- External links: `{% external_link "https://example.com" linkText="..." target="_self" %}`
  - Default target is `_blank` if not specified.
- Button links: `{% button_link "https://example.com" buttonIcon="xp-icon" buttonLabel="Label" target="_self" %}`

#### Create page links without hallucinating identifiers

When inserting `{% page_link %}`, never guess the `identifier`. Always get it from the target file's front matter.

Mandatory steps before writing a page link:

1. Locate the target page file in the repo.
2. Open the file and read the YAML front matter at the top.
3. Extract the exact `identifier` value and use it in `page_link`.
4. Set the `collection` based on the folder (necessary only if referencing a file from a different collection):
   - `_documentation/**` -> `collection="documentation"`
   - `_guides/**` -> `collection="guides"`
   - `_api/**` -> `collection="api"`
5. If adding an anchor, only use an anchor that actually exists on the target page.

If the target file cannot be found or has no `identifier`, do not fabricate an ID. Instead, insert a visible placeholder:
`<!-- TODO: Insert correct identifier after confirming target page front matter -->`

### Layout Components

- Grid (responsive card layouts):
  ```liquid
  {% grid columns="3" %}
  {% grid_item %}Content{% endgrid_item %}
  {% grid_item %}Content{% endgrid_item %}
  {% endgrid %}
  ```
  - `columns` (required, 1-12).
- Columns:
  ```liquid
  {% columns %}
    {% column %}Col 1{% endcolumn %}
    {% column %}Col 2{% endcolumn %}
  {% endcolumns %}
  ```
  - Up to 4 columns, responsive.
- Panel: `{% panel %}…{% endpanel %}`
- Card:
  ```liquid
  {% card title="Title" link="page-id" collection="documentation" icon="xp-name" %}
  Description
  {% endcard %}
  ```
- Banner: `{% banner title="Notice" %}…{% endbanner %}` (modes: `primary`, `secondary`)

### Icons

```liquid
{% icon xp-cb-check color="blue" fastyle="fa-solid" %}
```

- Libraries: KX13 (`kx13-` prefix), XP (`xp-` prefix), Font Awesome (`fa-*`).

### Status

- `{% status ADDED %}` or `{% status UPDATED bgcolor="green" color="white" %}`

### Tables

```liquid
{% table %}
    {% row header=true %}
        {% cell %}H1{% endcell %}
        {% cell %}H2{% endcell %}
    {% endrow %}
    {% row %}
        {% cell colspan=2 %}Merged{% endcell %}
    {% endrow %}
{% endtable %}
```

- Row options: `header`, `secondaryHeader`, `bgcolor`.
- Cell options: `colspan`, `rowspan`.
- Use `insidelist=true` when a table appears inside a list item.

### Related Pages

- Add to front matter: `related_pages: ["id1", "id2"]` (same collection).

### Inline ToC

- Sidebar ToC comes from front matter `toc:`.
- Inline macro: `{% toc minHeadingLevel=2 maxHeadingLevel=3 %}` (only these two params supported inline).

## File Naming

- Lowercase, hyphenated filenames reflecting page titles (e.g., `administration-interface-basics.md`).
- Filenames determine URL slugs.
- Keep related content within the same collection; use consistent naming.

{% endraw %}