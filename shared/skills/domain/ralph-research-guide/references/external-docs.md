# External Documentation Research

Techniques for searching and retrieving external documentation during research.

## Available MCP Tools

| Tool | Purpose |
|---|---|
| `microsoft_docs_search` | Search Microsoft Learn documentation by keyword |
| `web_fetch` | Fetch content from any public URL |

## When to Use External Docs

- The task involves .NET / ASP.NET Core APIs, configuration, or patterns
- Xperience source code uses a Microsoft API and the usage isn't self-evident
- The JIRA issue mentions third-party integrations (Azure, SendGrid, etc.)
- Existing docs reference external concepts without explanation

## Search Strategy

### Microsoft Learn

1. **Start with `microsoft_docs_search`** using the specific API name or concept (e.g., "IOptions pattern", "ASP.NET Core middleware")
2. **Fetch the top results** with `web_fetch` to get the full page content
3. **Extract what's relevant** — don't dump entire MS Learn pages; pull the specific patterns, code samples, or configuration guidance that applies

### Other Public Sources

- Official product documentation for third-party tools referenced in the task
- NuGet package READMEs for relevant packages
- GitHub repository documentation for open-source dependencies

## What to Report

For each external reference:
- Source URL (full canonical URL)
- What's relevant from it (specific APIs, patterns, configuration)
- How it relates to the Xperience implementation (confirms, supplements, or contradicts)

Keep external findings brief and focused — the writer needs actionable context, not encyclopedic coverage.
