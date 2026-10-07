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
} from "../shared";

const inputSchema: Record<string, z.ZodTypeAny> = {
  pullRequestId: z.number().describe("Pull request ID"),
  threadId: z.number().describe("Thread ID to reply to"),
  content: z.string().describe("Reply text (markdown supported)"),
};

if (!TASK_PROJECT) inputSchema.project = z.string().describe("ADO project name");
if (!TASK_REPO) inputSchema.repositoryId = z.string().describe("Repository name or GUID");

export const tool: ToolDefinition = {
  name: "ado_reply_to_comment",
  config: {
    description: "Reply to an existing comment thread on a pull request.",
    inputSchema: z.object(inputSchema),
  },
  handler: async (args) => {
    const project = TASK_PROJECT ?? String(args.project);
    const repositoryId = TASK_REPO ?? String(args.repositoryId);
    const { pullRequestId, threadId, content } = args;
    const url = repoUrl(project, repositoryId, `pullRequests/${pullRequestId}/threads/${threadId}/comments`);

    try {
      const res = await axios.post(
        url,
        { content: sanitizeContent(String(content)), parentCommentId: 1, commentType: 1 },
        reqConfig(),
      );
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ success: true, commentId: res.data.id, threadId }),
          },
        ],
      };
    } catch (err: unknown) {
      return errorResult(err);
    }
  },
};
