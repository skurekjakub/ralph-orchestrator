---
name: ralph-build-errors
description: "Troubleshooting guide for common npm run build errors in the Xperience docs site. Use this skill when the build fails and you need to diagnose the cause — covers broken page_link identifiers, missing anchors, duplicate identifiers, code blocks missing lang parameter, circular redirects, URI path conflicts, and frontmatter issues. Read this before spending cycles debugging build failures manually."
---
{% raw %}

# Build Error Troubleshooting

`npm run build` runs the Jekyll build with validation. When it fails, the error message tells you exactly what's wrong. Here's how to fix each type.

## Broken page_link identifier

**Error:** `identifier "unknownID" not found`

**Cause:** A `{% page_link unknownID %}` references an identifier that doesn't exist.

**Fix:**
1. Check for typos in the identifier
3. If the page was removed, update or remove the link

## Missing anchor reference

**Error:** `anchor "myAnchor" not defined in current page`

**Cause:** An `{% inpage_link "myAnchor" %}` exists but no matching `{% anchor myAnchor %}` is defined on the same page.

**Fix:**
1. Add `{% anchor myAnchor %}` at the target location on the page
2. Or fix the typo in either the anchor definition or the inpage_link reference
3. Anchor IDs are case-sensitive

## Duplicate identifier

**Error:** `Duplicate identifier "myID" in pagetree`

**Cause:** Two pages use the same `identifier` value.

**Fix:**
1. Grep for the identifier: `grep -r "identifier: myID" src/_data/ src/_documentation/`
2. Rename one of the duplicates — if you created it, change yours
3. Update all `page_link` references to use the new identifier

## Code block missing lang

**Error:** `required parameter 'lang' is missing`

**Cause:** A `{% code %}` or `{% code_link %}` tag without the `lang` parameter.

**Fix:** Add the language parameter:
```liquid
{% code lang=csharp %}
```
Common values: `csharp`, `xml`, `json`, `javascript`, `html`, `css`, `sql`, `powershell`, `bash`

## Circular redirect

**Error:** `Circular redirect detected`

**Cause:** Page A has `redirect_from` pointing to B, and B has `redirect_from` pointing to A (or a longer chain).

**Fix:**
1. Decide which page is canonical
2. Remove the `redirect_from` entry from the canonical page that creates the cycle
3. Redirects should always point FROM old paths TO the current page

## URI path conflict

**Error:** `Multiple pages resolve to the same URL`

**Cause:** Two pages generate the same URL path (same filename in same directory, or conflicting `redirect_from`).

**Fix:**
1. Rename one of the files to produce a different URL
2. Or remove the conflicting `redirect_from` entry

## General debugging steps

1. Read the full error message — it usually includes the file path and line
2. Run `npm run build` after every single file change, not in batches
4. The build validates frontmatter, links, and tag syntax — fix issues in that order
{% endraw %}
