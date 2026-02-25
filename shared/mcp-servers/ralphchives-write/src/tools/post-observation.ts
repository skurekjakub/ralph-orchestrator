import { z } from "zod";
import { type ToolDefinition, errorResult, nodebbPost, NODEBB_CATEGORY_ID, unavailableReason } from "../shared.js";

interface TopicResponse {
  tid: number;
  slug: string;
  mainPid: number;
}

const inputSchema: Record<string, z.ZodTypeAny> = {
  title: z.string().describe("Short observation title (e.g. 'Content Item API naming inconsistency')"),
  content: z.string().describe("Detailed observation in markdown — what you noticed, why it matters, any suggestions"),
  tags: z.array(z.string()).optional().describe("Tags for categorization"),
};

if (!NODEBB_CATEGORY_ID) {
  inputSchema.categoryId = z.number().describe("NodeBB category ID to post into");
}

export const tool: ToolDefinition = {
  name: "post_observation",
  config: {
    description:
      "Post a standalone observation to Ralphchives. Use this for insights " +
      "discovered during a task that aren't part of the task report — patterns, " +
      "inconsistencies, documentation gaps, or improvement suggestions.",
    inputSchema,
  },
  handler: async (args) => {
    if (unavailableReason) return errorResult(unavailableReason);
    const cid = NODEBB_CATEGORY_ID ?? Number(args.categoryId);
    const { title, content, tags } = args;

    try {
      const topic = await nodebbPost<TopicResponse>("/api/v3/topics", {
        cid,
        title: `[Observation] ${String(title)}`,
        content: String(content),
        tags: Array.isArray(tags) ? [...tags.map(String), "observation"] : ["observation"],
      });

      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            success: true,
            topicId: topic.tid,
            slug: topic.slug,
            message: "Observation posted to Ralphchives",
          }),
        }],
      };
    } catch (err: unknown) {
      return errorResult(err);
    }
  },
};
