import axios from "axios";
import { z } from "zod";
import {
  type ToolDefinition,
  apiBase,
  errorResult,
  reqConfig,
  repoUrl,
  sanitizeContent,
  TASK_PROJECT,
  TASK_REPO,
  TASK_BRANCH,
  TARGET_BRANCH,
  SOURCE_BRANCH,
} from "../shared";

const inputSchema: Record<string, z.ZodTypeAny> = {
  title: z.string().describe("Pull request title"),
  description: z.string().optional().describe("Pull request description (max 4000 chars)"),
  isDraft: z.boolean().optional().describe("Create as draft PR"),
};

if (!TASK_PROJECT) inputSchema.project = z.string().describe("ADO project name (e.g. CustomerEducation)");
if (!TASK_REPO) inputSchema.repositoryId = z.string().describe("Repository name or GUID");
if (!TASK_BRANCH) inputSchema.sourceRefName = z.string().describe("Source branch (e.g. refs/heads/feature)");

export const tool: ToolDefinition = {
  name: "ado_create_pull_request",
  config: {
    description:
      "Create a new pull request in an Azure DevOps repository. " +
      "Source branch name must include the refs/heads/ prefix. " +
      "Target branch is resolved from configuration: explicit target_branch overrides source_branch, which defaults to main.",
    inputSchema: z.object(inputSchema),
  },
  handler: async (args) => {
    const project = TASK_PROJECT ?? String(args.project);
    const repositoryId = TASK_REPO ?? String(args.repositoryId);
    const sourceRefName = TASK_BRANCH ? `refs/heads/${TASK_BRANCH}` : String(args.sourceRefName);
    const targetRefName = `refs/heads/${TARGET_BRANCH || SOURCE_BRANCH || "main"}`;
    const { title, description, isDraft } = args;
    const url = repoUrl(project, repositoryId, "pullrequests");

    try {
      const body: Record<string, unknown> = {
        sourceRefName,
        targetRefName,
        title,
        supportsIterations: true,
      };
      if (description !== undefined) body.description = sanitizeContent(String(description));
      if (isDraft !== undefined) body.isDraft = isDraft;

      const res = await axios.post(url, body, reqConfig());
      const pr = res.data;
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              success: true,
              pullRequestId: pr.pullRequestId,
              status: pr.status,
              url: `${apiBase}/${encodeURIComponent(project)}/_git/${encodeURIComponent(repositoryId)}/pullrequest/${pr.pullRequestId}`,
            }),
          },
        ],
      };
    } catch (err: unknown) {
      return errorResult(err);
    }
  },
};
