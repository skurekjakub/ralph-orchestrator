---
name: ralph-screenshots
description: "Instructions for capturing clean admin UI screenshots using playwright-cli for the Xperience by Kentico documentation. Use this skill whenever a task requires taking screenshots of the admin interface, documenting UI elements visually, capturing visual references for documentation pages, or when the JIRA issue mentions screenshots, images, or visual documentation."
---

# Screenshots Skill

Instructions for capturing clean admin UI screenshots using `playwright-cli` for the Xperience by Kentico documentation.

## Prerequisites

- `playwright-cli` must be available (run `playwright-cli open` to verify; if unavailable, use `npx playwright-cli`).
- The Xperience admin application must be running (typically on `http://localhost:666/admin`). If not running, use `npm run codesamples:serve`. Login is administrator:admin.

## Standard Capture Workflow

### 1. Open browser and navigate

```bash
playwright-cli open http://localhost:666/admin
# Resize to standard documentation width
playwright-cli resize 1366 900
```

### 2. Log in (if needed)

```bash
playwright-cli snapshot
# Use refs from snapshot to fill login form
playwright-cli fill <email-ref> "administrator"
playwright-cli fill <password-ref> "admin"
playwright-cli click <login-button-ref>
```

### 3. Navigate to the target page

```bash
playwright-cli goto http://localhost:666/admin/<path>
playwright-cli snapshot
```

### 4. Capture screenshot with run-code

Use `playwright-cli run-code` for every screenshot. The script must:

1. **Hide the AIRA panel** (`display: none`)
2. **Add red highlight outlines** if needed (`outline: 3px solid red`)
3. **Calculate a clip region** that excludes the left sidebar and crops dead space at the bottom
4. **Take the screenshot** with the calculated clip

```bash
playwright-cli run-code "async page => {
  // 1. Hide AIRA
  await page.evaluate(() => {
    const aira = document.querySelector('[class*=\"aira___\"]');
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
    const sidebar = document.querySelector('[data-testid=\"application-menu\"]');
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
  return 'Done: ' + clip.width + 'x' + clip.height;
}"
```

### 5. Clear highlights between screenshots

When reusing the same page for multiple screenshots with different highlights:

```bash
playwright-cli eval "(() => { document.querySelectorAll('*').forEach(el => { if (el.style.outline?.includes('red')) { el.style.outline = ''; el.style.outlineOffset = ''; el.style.borderRadius = ''; } }); })()"
```

### 6. Copy screenshots to documentation assets

```bash
cp <filename>.png /workspace/src/_docsassets/documentation/<target-folder>/<filename>.png
```

## Quick Screenshot (no clip)

For simple full-viewport or element screenshots without the clip calculation:

```bash
# Full viewport
playwright-cli screenshot --filename=page_overview.png

# Specific element by ref
playwright-cli screenshot <element-ref> --filename=detail.png
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

## playwright-cli Reference

Full command reference for the underlying CLI tool.

### Core Commands

```bash
playwright-cli open                          # open new browser
playwright-cli open https://example.com      # open and navigate
playwright-cli goto https://example.com      # navigate current page
playwright-cli snapshot                      # get page DOM tree with element refs
playwright-cli click <ref>                   # click element
playwright-cli dblclick <ref>                # double-click element
playwright-cli fill <ref> "value"            # fill input field
playwright-cli type "text"                   # type text
playwright-cli hover <ref>                   # hover element
playwright-cli select <ref> "option-value"   # select dropdown option
playwright-cli check <ref>                   # check checkbox
playwright-cli uncheck <ref>                 # uncheck checkbox
playwright-cli drag <ref-from> <ref-to>      # drag and drop
playwright-cli upload ./file.pdf             # upload file
playwright-cli eval "document.title"         # evaluate JS expression
playwright-cli eval "el => el.textContent" <ref>  # evaluate on element
playwright-cli resize 1920 1080              # resize viewport
playwright-cli close                         # close browser
```

### Navigation

```bash
playwright-cli go-back
playwright-cli go-forward
playwright-cli reload
```

### Keyboard

```bash
playwright-cli press Enter
playwright-cli press ArrowDown
playwright-cli press Tab
playwright-cli keydown Shift
playwright-cli keyup Shift
```

### Mouse

```bash
playwright-cli mousemove 150 300
playwright-cli mousedown
playwright-cli mouseup
playwright-cli mousewheel 0 100
```

### Screenshots & PDF

```bash
playwright-cli screenshot                        # viewport screenshot
playwright-cli screenshot <ref>                  # element screenshot
playwright-cli screenshot --filename=page.png    # named screenshot
playwright-cli pdf --filename=page.pdf           # save as PDF
```

### Tabs

```bash
playwright-cli tab-list
playwright-cli tab-new https://example.com
playwright-cli tab-close
playwright-cli tab-select 0
```

### Dialogs

```bash
playwright-cli dialog-accept
playwright-cli dialog-accept "confirmation text"
playwright-cli dialog-dismiss
```

### DevTools

```bash
playwright-cli console                   # view console output
playwright-cli console warning           # filter by level
playwright-cli network                   # view network requests
playwright-cli tracing-start             # start trace recording
playwright-cli tracing-stop              # stop and save trace
playwright-cli video-start               # start video recording
playwright-cli video-stop recording.webm # stop and save video
```

## Specific tasks

* **Running custom Playwright code** [references/running-code.md](references/running-code.md)
* **Browser session management** [references/session-management.md](references/session-management.md)
* **Storage state (cookies, localStorage)** [references/storage-state.md](references/storage-state.md)
* **Request mocking** [references/request-mocking.md](references/request-mocking.md)
* **Test generation** [references/test-generation.md](references/test-generation.md)
* **Tracing** [references/tracing.md](references/tracing.md)
* **Video recording** [references/video-recording.md](references/video-recording.md)
