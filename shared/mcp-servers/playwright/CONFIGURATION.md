# Playwright MCP Server — Configuration

Browser automation via Playwright — navigate, screenshot, interact with web pages. This is an npm-packaged server (`playwright-mcp`), not a custom-built one.

**Sidecar port:** 9103  
**Type:** `npm` (`@playwright/mcp` 0.0.83 installed globally in the sidecar image, with the Chromium build it expects from `playwright-mcp install-browser --with-deps chromium`). The manifest launches it as `playwright-mcp --browser chromium`; without the flag it looks for Google Chrome, which the image does not install. The gateway runs it under supergateway.

## Environment Variables

None. Playwright runs headlessly in the sidecar container with no external credentials.

## Profile Wiring

Add to the `mcpServers` array in `profile.json`:

```json
{ "name": "playwright" }
```

No `env` block is needed.

## Tools

### `browser_navigate`

Navigate to a URL in the browser.

### `browser_navigate_back`

Navigate back in browser history.

### `browser_take_screenshot`

Take a screenshot of the current page.

### `browser_network_requests`

List network requests made by the page.

### `browser_click`

Click an element on the page.

### `browser_fill_form`

Fill a form field with a value.

### `browser_evaluate`

Evaluate JavaScript in the browser context.

### `browser_press_key`

Press a keyboard key.
