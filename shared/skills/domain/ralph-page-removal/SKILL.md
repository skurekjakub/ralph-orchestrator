---
name: ralph-page-removal
description: "Checklist for removing or deprecating documentation pages without leaving broken links. Use this skill whenever a task requires deleting a page, merging pages, or replacing one page with another. Covers removing from documentation.yml, setting up redirects, cleaning up orphaned page_link references, updating related_pages arrays, and removing orphaned images."
---
{% raw %}

# Page Removal Checklist

Removing a page incorrectly breaks links across the site. Follow this checklist in order.

## 1. Identify all references to the page

Find every place the page's identifier is used:
```bash
grep -r "IDENTIFIER" src/_documentation/ src/_data/
```

## 2. Update or remove page_link references

For each `{% page_link IDENTIFIER %}` found:
- If there's a replacement page, update to the new identifier
- If the content is being merged into another page, link to that page with an appropriate anchor
- If the content is being removed entirely, remove the link and rewrite the surrounding text

## 3. Set up redirects

If the page had traffic or external links, add `redirect_from` to the replacement page:
```yaml
redirect_from:
  - /documentation/path/to/old-page
  - x/OLD_IDENTIFIER
```

If no replacement exists, consider whether a redirect to the parent section is appropriate.

## 4. Update related_pages arrays

Search for the identifier in `related_pages` frontmatter fields:
```bash
grep -r "IDENTIFIER" src/_documentation/ --include="*.md" -l
```

Remove the identifier from any `related_pages` arrays.

## 5. Clean up orphaned assets

If the page referenced images that no other page uses:
```bash
# Find images referenced only by the deleted page
grep -r "image_filename.png" src/_documentation/ --include="*.md"
```

If no other page references the image, delete it from `src/_assets/img/`.

## 6. Validate

Run `npm run build` to confirm no broken references remain.
{% endraw %}
