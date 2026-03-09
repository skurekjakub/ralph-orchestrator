"""Tool: create a subtask on an existing JIRA issue."""

from fastmcp import FastMCP

from jira_client import PROJECT_KEY, text_to_adf, create_issue


def register(mcp: FastMCP) -> None:
    @mcp.tool()
    async def create_doc_subtask(
        parent_key: str,
        summary: str,
        description: str = "",
        labels: list[str] | None = None,
    ) -> str:
        """Create a subtask under an existing JIRA issue in the DOC project.

        Args:
            parent_key: Parent issue key, e.g. "DOC-3200".
            summary: Subtask title / summary line.
            description: Optional subtask description (plain text — converted to ADF automatically).
            labels: Optional list of labels to apply.
        """
        payload: dict = {
            "fields": {
                "project": {"key": PROJECT_KEY},
                "parent": {"key": parent_key},
                "summary": summary,
                "issuetype": {"name": "Subtask"},
            }
        }
        if description:
            payload["fields"]["description"] = text_to_adf(description)
        if labels:
            payload["fields"]["labels"] = labels

        ok, result = await create_issue(payload)
        if ok:
            key = result.get("key", "?")
            issue_id = result.get("id", "?")
            return f"Created subtask {key} (id={issue_id}) under {parent_key}: https://kentico.atlassian.net/browse/{key}"
        return result
