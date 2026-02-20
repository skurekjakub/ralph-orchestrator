import axios from "axios";
import { z } from "zod";
import { type ToolDefinition, apiBase, errorResult, reqConfig, repoUrl } from "../shared.js";

export const tool: ToolDefinition = {
  name: "ado_create_pull_request",
  config: {
    description:
      "Create a new pull request in an Azure DevOps repository. " +
      "Source and target branch names must include the refs/heads/ prefix.",
    inputSchema: {
      project: z.string().describe("ADO project name (e.g. CustomerEducation)"),
      repositoryId: z.string().describe("Repository name or GUID"),
      sourceRefName: z.string().describe("Source branch (e.g. refs/heads/feature)"),
      targetRefName: z.string().describe("Target branch (e.g. refs/heads/main)"),
      title: z.string().describe("Pull request title"),
      description: z.string().optional().describe("Pull request description (max 4000 chars)"),
      isDraft: z.boolean().optional().describe("Create as draft PR"),
    },
  },
  handler: async ({ project, repositoryId, sourceRefName, targetRefName, title, description, isDraft }) => {
    const url = repoUrl(String(project), String(repositoryId), "pullrequests");

    try {
      const body: Record<string, unknown> = {
        sourceRefName,
        targetRefName,
        title,
        supportsIterations: true,
      };
      if (description !== undefined) body.description = description;
      if (isDraft !== undefined) body.isDraft = isDraft;

      const res = await axios.post(url, body, reqConfig());
      const pr = res.data;
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            success: true,
            pullRequestId: pr.pullRequestId,
            status: pr.status,
            url: `${apiBase}/${encodeURIComponent(String(project))}/_git/${encodeURIComponent(String(repositoryId))}/pullrequest/${pr.pullRequestId}`,
          }),
        }],
      };
    } catch (err: unknown) {
      return errorResult(err);
    }
  },
};
