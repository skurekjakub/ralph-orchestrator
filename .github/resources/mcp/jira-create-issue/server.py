"""
MCP server: create JIRA issues and subtasks in the DOC project.

Pre-parameterized with Kentico JIRA cloud credentials.
Run via: uvx fastmcp run .github/resources/mcp/jira-create-issue/server.py
"""

import sys
from pathlib import Path

from fastmcp import FastMCP

# Allow tool modules to import jira_client from the server root
sys.path.insert(0, str(Path(__file__).resolve().parent))

from tools.create_issue import register as register_create_issue  # noqa: E402
from tools.create_subtask import register as register_create_subtask  # noqa: E402

mcp = FastMCP("jira-create-issue")

register_create_issue(mcp)
register_create_subtask(mcp)
