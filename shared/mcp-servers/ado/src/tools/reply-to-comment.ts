import axios from "axios";
import { z } from "zod";
import { type ToolDefinition, errorResult, reqConfig, repoUrl } from "../shared.js";

export const tool: ToolDefinition = {
  name: "ado_reply_to_comment",
  config: {
    description:
      "Reply to an existing comment thread on a pull request.",
    inputSchema: {
      project: z.string().describe("ADO project name"),
      repositoryId: z.string().describe("Repository name or GUID"),
      pullRequestId: z.number().describe("Pull request ID"),
      threadId: z.number().describe("Thread ID to reply to"),
      content: z.string().describe("Reply text (markdown supported)"),
    },
  },
  handler: async ({ project, repositoryId, pullRequestId, threadId, content }) => {
    const url = repoUrl(String(project), String(repositoryId), `pullRequests/${pullRequestId}/threads/${threadId}/comments`);

    try {
      const res = await axios.post(url, { content, parentCommentId: 1, commentType: 1 }, reqConfig());
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({ success: true, commentId: res.data.id, threadId }),
        }],
      };
    } catch (err: unknown) {
      return errorResult(err);
    }
  },
};
