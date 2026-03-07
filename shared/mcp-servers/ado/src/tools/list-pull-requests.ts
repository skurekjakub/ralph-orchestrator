import axios from "axios";
import { z } from "zod";
import { type ToolDefinition, API_VERSION, apiBase, errorResult, reqConfig, TASK_PROJECT, TASK_REPO, TASK_BRANCH } from "../shared.js";

const inputSchema: Record<string, z.ZodTypeAny> = {
  status: z.enum(["active", "completed", "abandoned", "all"]).optional().describe("PR status filter (default: active)"),
  targetRefName: z.string().optional().describe("Filter by target branch"),
  top: z.number().optional().describe("Max results (default: 25)"),
};

if (!TASK_PROJECT) inputSchema.project = z.string().describe("ADO project name");
if (!TASK_REPO) inputSchema.repositoryId = z.string().describe("Repository name or GUID");
if (!TASK_BRANCH) inputSchema.sourceRefName = z.string().optional().describe("Filter by source branch (e.g. refs/heads/feature)");

export const tool: ToolDefinition = {
  name: "ado_list_pull_requests",
  config: {
    description:
      "List pull requests in an Azure DevOps repository. " +
      "Filter by status (active, abandoned, completed, all), source branch, or target branch.",
    inputSchema,
  },
  handler: async (args) => {
    const project = TASK_PROJECT ?? String(args.project);
    const repositoryId = TASK_REPO ?? String(args.repositoryId);
    const sourceRefName = TASK_BRANCH ? `refs/heads/${TASK_BRANCH}` : args.sourceRefName ? String(args.sourceRefName) : undefined;
    const { status, targetRefName, top } = args;

    const params = new URLSearchParams({ "api-version": API_VERSION });
    if (status) params.set("searchCriteria.status", String(status));
    if (sourceRefName) params.set("searchCriteria.sourceRefName", sourceRefName);
    if (targetRefName) params.set("searchCriteria.targetRefName", String(targetRefName));
    params.set("$top", String(top ?? 25));

    const url = `${apiBase}/${encodeURIComponent(project)}/_apis/git/repositories/${encodeURIComponent(repositoryId)}/pullrequests?${params}`;

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
