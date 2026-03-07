"""
Single-tool MCP server: create JIRA issues in the DOC project.

Pre-parameterized with Kentico JIRA cloud credentials.
Run via: uvx fastmcp run .github/resources/mcp/jira-create-issue/server.py
"""

import os
import json
from base64 import b64encode

import httpx
from fastmcp import FastMCP

CLOUD_ID = "37df0bb1-cba3-49a3-a001-61b91bdd8c08"
PROJECT_KEY = "DOC"
BASE_URL = f"https://api.atlassian.com/ex/jira/{CLOUD_ID}/rest/api/3"

JIRA_EMAIL = os.environ["JIRA_EMAIL"]
JIRA_PAT = os.environ["JIRA_PAT"]

_auth_header = "Basic " + b64encode(f"{JIRA_EMAIL}:{JIRA_PAT}".encode()).decode()

mcp = FastMCP("jira-create-issue")


@mcp.tool()
async def create_doc_issue(
    summary: str,
    description: str,
    issue_type: str = "Story",
    labels: list[str] | None = None,
) -> str:
    """Create a JIRA issue in the DOC project.

    Args:
        summary: Issue title / summary line.
        description: Full issue description (plain text — converted to ADF automatically).
        issue_type: Issue type name, e.g. "Task", "Bug", "Story". Defaults to "Task".
        labels: Optional list of labels to apply.
    """
    # Build ADF description from plain text (paragraphs split on double-newline)
    paragraphs = [p.strip() for p in description.split("\n\n") if p.strip()]
    adf_content = [
        {
            "type": "paragraph",
            "content": [{"type": "text", "text": para}],
        }
        for para in paragraphs
    ]
    adf_doc = {"type": "doc", "version": 1, "content": adf_content}

    payload: dict = {
        "fields": {
            "project": {"key": PROJECT_KEY},
            "summary": summary,
            "issuetype": {"name": issue_type},
            "description": adf_doc,
        }
    }
    if labels:
        payload["fields"]["labels"] = labels

    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            f"{BASE_URL}/issue",
            headers={
                "Authorization": _auth_header,
                "Content-Type": "application/json",
                "Accept": "application/json",
            },
            content=json.dumps(payload),
        )

    if resp.status_code in (200, 201):
        data = resp.json()
        key = data.get("key", "?")
        issue_id = data.get("id", "?")
        return f"Created {key} (id={issue_id}): https://kentico.atlassian.net/browse/{key}"

    return f"JIRA API error {resp.status_code}: {resp.text}"
