import axios from "axios";
import { z } from "zod";
import { type ToolDefinition, errorResult, reqConfig, repoUrl, TASK_PROJECT, TASK_REPO } from "../shared.js";

const inputSchema: Record<string, z.ZodTypeAny> = {
  pullRequestId: z.number().describe("Pull request ID"),
};

if (!TASK_PROJECT) inputSchema.project = z.string().describe("ADO project name");
if (!TASK_REPO) inputSchema.repositoryId = z.string().describe("Repository name or GUID");

export const tool: ToolDefinition = {
  name: "ado_list_pull_request_threads",
  config: {
    description:
      "List comment threads on a pull request. Returns thread status, " +
      "file context, and all comments with authors.",
    inputSchema: z.object(inputSchema),
  },
  handler: async (args) => {
    const project = TASK_PROJECT ?? String(args.project);
    const repositoryId = TASK_REPO ?? String(args.repositoryId);
    const { pullRequestId } = args;
    const url = repoUrl(project, repositoryId, `pullRequests/${pullRequestId}/threads`);

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
