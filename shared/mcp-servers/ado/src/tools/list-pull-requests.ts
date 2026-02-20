import axios from "axios";
import { z } from "zod";
import { type ToolDefinition, API_VERSION, apiBase, errorResult, reqConfig } from "../shared.js";

export const tool: ToolDefinition = {
  name: "ado_list_pull_requests",
  config: {
    description:
      "List pull requests in an Azure DevOps repository. " +
      "Filter by status, source branch, or target branch.",
    inputSchema: {
      project: z.string().describe("ADO project name"),
      repositoryId: z.string().describe("Repository name or GUID"),
      status: z.enum(["active", "completed", "abandoned", "all"]).optional().describe("PR status filter (default: active)"),
      sourceRefName: z.string().optional().describe("Filter by source branch (e.g. refs/heads/feature)"),
      targetRefName: z.string().optional().describe("Filter by target branch"),
      top: z.number().optional().describe("Max results (default: 25)"),
    },
  },
  handler: async ({ project, repositoryId, status, sourceRefName, targetRefName, top }) => {
    const params = new URLSearchParams({ "api-version": API_VERSION });
    if (status) params.set("searchCriteria.status", String(status));
    if (sourceRefName) params.set("searchCriteria.sourceRefName", String(sourceRefName));
    if (targetRefName) params.set("searchCriteria.targetRefName", String(targetRefName));
    params.set("$top", String(top ?? 25));

    const url = `${apiBase}/${encodeURIComponent(String(project))}/_apis/git/repositories/${encodeURIComponent(String(repositoryId))}/pullrequests?${params}`;

    try {
      const res = await axios.get(url, reqConfig());
      const prs = (res.data.value ?? []).map((pr: Record<string, unknown>) => ({
        pullRequestId: pr.pullRequestId,
        title: pr.title,
        status: pr.status,
        sourceRefName: pr.sourceRefName,
        targetRefName: pr.targetRefName,
        createdBy: (pr.createdBy as Record<string, unknown>)?.displayName,
        isDraft: pr.isDraft,
      }));
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ success: true, count: prs.length, pullRequests: prs }) }],
      };
    } catch (err: unknown) {
      return errorResult(err);
    }
  },
};
