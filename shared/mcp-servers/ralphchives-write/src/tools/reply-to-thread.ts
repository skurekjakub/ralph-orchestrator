import { z } from "zod";
import { type ToolDefinition, errorResult, nodebbPost, unavailableReason } from "../shared.js";

interface PostResponse {
  pid: number;
  tid: number;
}

const inputSchema = z.object({
  topicId: z.number().int().describe("Topic ID to reply to (from search_ralphchives or list_recent_topics)"),
  content: z.string().describe("Reply content in markdown"),
});

export const tool: ToolDefinition = {
  name: "reply_to_thread",
  config: {
    description:
      "Reply to an existing Ralphchives topic. Use this to add follow-up information, " +
      "corrections, or discussion to a previous task report or observation.",
    inputSchema,
  },
  handler: async (args) => {
    if (unavailableReason) return errorResult(unavailableReason);
    const topicId = Number(args.topicId);
    const content = String(args.content);

    try {
      const post = await nodebbPost<PostResponse>(`/api/v3/topics/${topicId}`, {
        content,
      });

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              success: true,
              postId: post.pid,
              topicId: post.tid,
              message: "Reply posted to Ralphchives topic",
            }),
          },
        ],
      };
    } catch (err: unknown) {
      return errorResult(err);
    }
  },
};
