import axios from "axios";
import { z } from "zod";
import { type ToolDefinition, errorResult, reqConfig, repoUrl } from "../shared.js";

export const tool: ToolDefinition = {
  name: "ado_list_pull_request_threads",
  config: {
    description:
      "List comment threads on a pull request. Returns thread status, " +
      "file context, and all comments with authors.",
    inputSchema: {
      project: z.string().describe("ADO project name"),
      repositoryId: z.string().describe("Repository name or GUID"),
      pullRequestId: z.number().describe("Pull request ID"),
    },
  },
  handler: async ({ project, repositoryId, pullRequestId }) => {
    const url = repoUrl(String(project), String(repositoryId), `pullRequests/${pullRequestId}/threads`);

    try {
      const res = await axios.get(url, reqConfig());
      const threads = (res.data.value ?? []).map((t: Record<string, unknown>) => ({
        id: t.id,
        status: t.status,
        publishedDate: t.publishedDate,
        threadContext: t.threadContext,
        comments: ((t.comments as Array<Record<string, unknown>>) ?? [])
          .filter((c) => !c.isDeleted)
          .map((c) => ({
            id: c.id,
            parentCommentId: c.parentCommentId,
            content: c.content,
            author: (c.author as Record<string, unknown>)?.displayName,
            commentType: c.commentType,
          })),
      }));
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ success: true, count: threads.length, threads }) }],
      };
    } catch (err: unknown) {
      return errorResult(err);
    }
  },
};
