"""Tool: create a JIRA issue in the DOC project."""

from fastmcp import FastMCP

from jira_client import PROJECT_KEY, text_to_adf, create_issue


def register(mcp: FastMCP) -> None:
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
            issue_type: Issue type name, e.g. "Task", "Bug", "Story". Defaults to "Story".
            labels: Optional list of labels to apply.
        """
        payload: dict = {
            "fields": {
                "project": {"key": PROJECT_KEY},
                "summary": summary,
                "issuetype": {"name": issue_type},
                "description": text_to_adf(description),
            }
        }
        if labels:
            payload["fields"]["labels"] = labels

        ok, result = await create_issue(payload)
        if ok:
            key = result.get("key", "?")
            issue_id = result.get("id", "?")
            return f"Created {key} (id={issue_id}): https://kentico.atlassian.net/browse/{key}"
        return result
