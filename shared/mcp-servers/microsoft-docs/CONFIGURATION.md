# Microsoft Docs MCP Server — Configuration

Search Microsoft Learn documentation (`learn.microsoft.com`) using the public search API. No authentication required.

**Sidecar port:** 9105

## Environment Variables

None. This server uses the public Microsoft Learn search API and requires no credentials.

## Profile Wiring

Add to the `mcpServers` array in `profile.json`:

```json
{ "name": "microsoft-docs" }
```

No `env` block is needed.

## Tools

### `microsoft_docs_search`

Search Microsoft Learn documentation. Returns titles, URLs, and descriptions. Use the `web_fetch` tool to retrieve the full content of a result page.

| Parameter    | Type   | Required | Description                                   |
| ------------ | ------ | -------- | --------------------------------------------- |
| `query`      | string | yes      | Search query                                  |
| `locale`     | string | no       | Locale for results (default: `en-us`)         |
| `maxResults` | number | no       | Maximum results to return, 1–50 (default: 10) |
