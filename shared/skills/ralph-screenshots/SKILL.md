---
name: ralph-screenshots
description: "Instructions for capturing clean admin UI screenshots using Playwright MCP for the Xperience by Kentico documentation. Use this skill whenever a task requires taking screenshots of the admin interface, documenting UI elements visually, capturing visual references for documentation pages, or when the JIRA issue mentions screenshots, images, or visual documentation."
---

# Screenshots Skill

Instructions for capturing clean admin UI screenshots using Playwright MCP for the Xperience by Kentico documentation.

## Prerequisites

- The Playwright MCP browser tools must be available in the agent context.
- The Xperience admin application must be running (typically on `http://localhost:666/admin`). If not running, use `npm run codesamples:serve`. Login is administrator:admin.
- Screenshots are saved to the host machine's CWD, bind-mounted at `/mnt/host/Users/<username>/`. After taking a screenshot, copy it to the workspace.

## Detecting the Host Username

The devcontainer runs as the `vscode` user. Detect the host username from the bind mount:

1. List `/mnt/host/Users/` and ignore system entries (`All Users`, `Default`, `Default User`, `DefaultAppPool`, `defaultuser0`, `Public`, `desktop.ini`).
2. The remaining entry is the host user.
3. If multiple candidates remain, use `ask_questions` to ask the user.

## Screenshot Output

After capture, copy screenshots to the documentation assets directory:

```bash
cp /mnt/host/Users/<username>/<filename>.png \
   /workspace/src/_docsassets/documentation/<target-folder>/<filename>.png
```

## Standard Capture Workflow

### 1. Navigate and wait

```
browser_navigate → http://localhost:666/admin/<path>
```

### 2. Use browser_run_code with clip to capture

Use `browser_run_code` for every screenshot. The script must:

1. **Hide the AIRA panel** (`display: none`)
2. **Add red highlight outlines** if needed (`outline: 3px solid red`)
3. **Calculate a clip region** that excludes the left sidebar and crops dead space at the bottom
4. **Take the screenshot** with the calculated clip

```javascript
async (page) => {
  // 1. Hide AIRA
  await page.evaluate(() => {
    const aira = document.querySelector('[class*="aira___"]');
    if (aira) aira.style.display = 'none';
  });

  // 2. Add highlights (optional)
  await page.evaluate(() => {
    document.querySelectorAll('button').forEach(btn => {
      if (btn.textContent.trim() === 'Save') {
        btn.style.outline = '3px solid red';
        btn.style.outlineOffset = '3px';
        btn.style.borderRadius = '4px';
      }
    });
  });

  // 3. Calculate clip (exclude sidebar, crop bottom dead space)
  const clip = await page.evaluate(() => {
    const sidebar = document.querySelector('[data-testid="application-menu"]');
    const contentDiv = sidebar?.nextElementSibling;
    const rect = contentDiv.getBoundingClientRect();
    let maxBottom = 0;
    contentDiv.querySelectorAll('*').forEach(el => {
      const r = el.getBoundingClientRect();
      if (r.height <= 0 || r.width <= 0) return;
      const s = getComputedStyle(el);
      const hasVisual = s.backgroundColor !== 'rgba(0, 0, 0, 0)' && s.backgroundColor !== 'transparent';
      const hasBorder = s.borderWidth !== '0px' && s.borderStyle !== 'none';
      const isContent = ['TABLE','TR','TD','TH','INPUT','BUTTON','IMG','A','P',
        'H1','H2','H3','H4','SPAN','LABEL','LI'].includes(el.tagName);
      const hasText = Array.from(el.childNodes).some(n => n.nodeType === 3 && n.textContent.trim());
      if (hasVisual || hasBorder || isContent || hasText) {
        if (r.bottom > maxBottom) maxBottom = r.bottom;
      }
      if (el.style.outline?.includes('red')) {
        if (r.bottom + 8 > maxBottom) maxBottom = r.bottom + 8;
      }
    });
    const padding = 32;
    return {
      x: rect.x, y: rect.y,
      width: Math.min(rect.width, 1366 - rect.x),
      height: Math.min(Math.ceil(maxBottom) + padding - rect.y, rect.height)
    };
  });

  // 4. Capture
  await page.screenshot({ path: '<filename>.png', type: 'png', clip });
  return `Done: ${clip.width}x${clip.height}`;
}
```

### 3. Clear highlights between screenshots

When reusing the same page for multiple screenshots with different highlights:

```javascript
document.querySelectorAll('*').forEach(el => {
  if (el.style.outline?.includes('red')) {
    el.style.outline = ''; el.style.outlineOffset = ''; el.style.borderRadius = '';
  }
});
```

## Admin UI DOM Structure

| Container | Selector | Notes |
|-----------|----------|-------|
| Left sidebar | `[data-testid="application-menu"]` | Global app navigation (96px). **Excluded** via clip `x` offset. |
| Content area | `sidebar.nextElementSibling` | Breadcrumbs + left nav + page body. **This is what we screenshot.** |
| AIRA panel | `[class*="aira___"]` | AI chat panel (right edge). **Hidden** via `display: none`. |

## File Naming

- **snake_case** for filenames (e.g., `customer_detail.png`, `promotion_create.png`)
- **PNG** format only
