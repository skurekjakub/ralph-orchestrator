/**
 * Copilot CLI arguments that control its bundled GitHub MCP server.
 *
 * @param githubMcpTools `false` disables the server (`--disable-builtin-mcps`); a list enables only those tools
 *   (`--add-github-mcp-tool <tool>` each).
 */
export function githubMcpArgs(githubMcpTools: false | readonly string[]): string[] {
  if (githubMcpTools === false) return ["--disable-builtin-mcps"];
  return githubMcpTools.flatMap((tool) => ["--add-github-mcp-tool", tool]);
}
