import { z } from "zod";
import { type ToolDefinition, errorResult, nodebbPost, NODEBB_CATEGORY_ID, unavailableReason } from "../shared.js";

interface TopicResponse {
  tid: number;
  slug: string;
  mainPid: number;
}

const inputShape: Record<string, z.ZodTypeAny> = {
  title: z.string().describe("Topic title — use the JIRA issue key as prefix (e.g. 'DF-123: Migrated API docs')"),
  content: z.string().describe("Full task report in markdown — include changes made, PR links, observations"),
  tags: z
    .array(z.string())
    .optional()
    .describe(
      "Tags for categorization (e.g. JIRA key, topic area). Maximum 5 tags — NodeBB rejects requests with more than 5.",
    ),
};

if (!NODEBB_CATEGORY_ID) {
  inputShape.categoryId = z.number().describe("NodeBB category ID to post into");
}

export const tool: ToolDefinition = {
  name: "post_task_report",
  config: {
    description:
      "Post a task report to Ralphchives after completing a JIRA task. " +
      "Creates a new topic in the profile's category with a structured summary " +
      "of what was done, what changed, and any observations.",
    inputSchema: z.object(inputShape),
  },
  handler: async (args) => {
    if (unavailableReason) return errorResult(unavailableReason);
    const cid = NODEBB_CATEGORY_ID ?? Number(args.categoryId);
    const { title, content, tags } = args;

    try {
      const topic = await nodebbPost<TopicResponse>("/api/v3/topics", {
        cid,
        title: String(title),
        content: String(content),
        tags: Array.isArray(tags) ? tags.map(String) : [],
      });

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              success: true,
              topicId: topic.tid,
              slug: topic.slug,
              message: "Task report posted to Ralphchives",
            }),
          },
        ],
      };
    } catch (err: unknown) {
      return errorResult(err);
    }
  },
};
