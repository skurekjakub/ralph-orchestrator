import axios from "axios";
import { z } from "zod";
import {
  type ToolDefinition,
  errorResult,
  reqConfig,
  repoUrl,
  sanitizeContent,
  TASK_PROJECT,
  TASK_REPO,
} from "../shared.js";

const inputSchema: Record<string, z.ZodTypeAny> = {
  pullRequestId: z.number().describe("Pull request ID"),
  content: z.string().describe("Comment text (markdown supported)"),
  status: z
    .enum(["active", "fixed", "wontFix", "closed", "byDesign", "pending"])
    .optional()
    .describe("Thread status (default: active)"),
  filePath: z.string().optional().describe("File path for file-level comment (e.g. /src/file.ts)"),
  startLine: z.number().optional().describe("Start line number for file-level comment"),
  endLine: z.number().optional().describe("End line number for file-level comment"),
};

if (!TASK_PROJECT) inputSchema.project = z.string().describe("ADO project name");
if (!TASK_REPO) inputSchema.repositoryId = z.string().describe("Repository name or GUID");

export const tool: ToolDefinition = {
  name: "ado_create_pull_request_thread",
  config: {
    description:
      "Create a new comment thread on a pull request. Can be a general comment " +
      "or a file-level comment with line context.",
    inputSchema,
  },
  handler: async (args) => {
    const project = TASK_PROJECT ?? String(args.project);
    const repositoryId = TASK_REPO ?? String(args.repositoryId);
    const { pullRequestId, content, status, filePath, startLine, endLine } = args;
    const url = repoUrl(project, repositoryId, `pullRequests/${pullRequestId}/threads`);

    const statusMap: Record<string, number> = {
      active: 1,
      fixed: 2,
      wontFix: 3,
      closed: 4,
      byDesign: 5,
      pending: 6,
    };

    const body: Record<string, unknown> = {
      comments: [{ parentCommentId: 0, content: sanitizeContent(String(content)), commentType: 1 }],
      status: statusMap[String(status ?? "active")],
    };

    if (filePath) {
      body.threadContext = {
        filePath,
        rightFileStart: { line: startLine ?? 1, offset: 1 },
        rightFileEnd: { line: endLine ?? startLine ?? 1, offset: 1 },
      };
    }

    try {
      const res = await axios.post(url, body, reqConfig());
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ success: true, threadId: res.data.id, status: res.data.status }),
          },
        ],
      };
    } catch (err: unknown) {
      return errorResult(err);
    }
  },
};
