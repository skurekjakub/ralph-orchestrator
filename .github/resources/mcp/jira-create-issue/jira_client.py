"""Shared JIRA REST API client for the DOC project."""

import os
import json
from base64 import b64encode

import httpx

CLOUD_ID = "37df0bb1-cba3-49a3-a001-61b91bdd8c08"
PROJECT_KEY = "DOC"
BASE_URL = f"https://api.atlassian.com/ex/jira/{CLOUD_ID}/rest/api/3"

JIRA_EMAIL = os.environ["JIRA_EMAIL"]
JIRA_PAT = os.environ["JIRA_PAT"]

AUTH_HEADER = "Basic " + b64encode(f"{JIRA_EMAIL}:{JIRA_PAT}".encode()).decode()

HEADERS = {
    "Authorization": AUTH_HEADER,
    "Content-Type": "application/json",
    "Accept": "application/json",
}


def text_to_adf(text: str) -> dict:
    """Convert plain text to Atlassian Document Format (paragraphs split on double-newline)."""
    paragraphs = [p.strip() for p in text.split("\n\n") if p.strip()]
    return {
        "type": "doc",
        "version": 1,
        "content": [
            {"type": "paragraph", "content": [{"type": "text", "text": para}]}
            for para in paragraphs
        ],
    }


async def create_issue(payload: dict) -> tuple[bool, dict | str]:
    """POST /issue with the given payload. Returns (success, data_or_error)."""
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            f"{BASE_URL}/issue",
            headers=HEADERS,
            content=json.dumps(payload),
        )

    if resp.status_code in (200, 201):
        return True, resp.json()
    return False, f"JIRA API error {resp.status_code}: {resp.text}"
