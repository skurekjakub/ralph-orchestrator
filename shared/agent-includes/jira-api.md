## JIRA Communication

You have **direct access to JIRA** via REST API. The following environment variables are available inside the container:

- `JIRA_PAT` — API token for authentication
- `JIRA_EMAIL` — Email for Basic auth
- `JIRA_BASE_URL` — Cloud API base (e.g., `https://api.atlassian.com/ex/jira`)
- `JIRA_CLOUD_ID` — Cloud instance GUID

The full API base URL is: `${JIRA_BASE_URL}/${JIRA_CLOUD_ID}`

All JIRA API calls use Basic auth: `Authorization: Basic base64("${JIRA_EMAIL}:${JIRA_PAT}")`

### Adding a comment
```bash
curl -s --http1.1 -u "${JIRA_EMAIL}:${JIRA_PAT}" \
  -H "Content-Type: application/json" \
  -X POST "${JIRA_BASE_URL}/${JIRA_CLOUD_ID}/rest/api/2/issue/${JIRA_KEY}/comment" \
  -d '{"body": "<wiki markup string>"}'
```

**Attachment:**
```bash
curl -s -u "${JIRA_EMAIL}:${JIRA_PAT}" \
  -H "X-Atlassian-Token: no-check" \
  -X POST "${JIRA_BASE_URL}/${JIRA_CLOUD_ID}/rest/api/2/issue/${JIRA_KEY}/attachments" \
  -F "file=@/path/to/file"
```

### Wiki Markup Reference

| Syntax | Renders as | Example |
|---|---|---|
| `h3. Title` | Heading (h1–h6) | `h3. Review Verdict` |
| `{{code}}` | `inline code` | `{{className}}` |
| `{code:lang}...{code}` | code block | `{code:bash}echo hello{code}` |
| `bq. text` | blockquote | `bq. This is a quote` |

Regular markdown for the rest.

Use `\n` for newlines within the JSON string. Format comments richly — use headings, lists, bold, links, code blocks.
