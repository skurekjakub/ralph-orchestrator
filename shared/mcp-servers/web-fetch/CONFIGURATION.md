# Web Fetch MCP Server — Configuration

Fetch the content of any URL and return it as text. The MCP sidecar has unrestricted internet access, so any public URL is reachable.

**Sidecar port:** 9104

## Environment Variables

None. This server requires no credentials — it fetches public URLs via the sidecar's direct internet connection.

## Profile Wiring

Add to the `mcpServers` array in `profile.json`:

```json
{ "name": "web-fetch" }
```

No `env` block is needed.

## Tools

### `web_fetch`

Fetch the content of a URL and return it as text.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `url` | string | yes | URL to fetch |
| `maxLength` | number | no | Maximum characters to return, 1–500,000 (default: 100,000) |
