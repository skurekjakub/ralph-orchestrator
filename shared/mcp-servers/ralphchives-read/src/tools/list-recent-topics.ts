import { z } from "zod";
import { type ToolDefinition, errorResult, nodebbGet, NODEBB_CATEGORY_ID, unavailableReason } from "../shared.js";

interface TopicSummary {
  tid: number;
  title: string;
  slug: string;
  postcount: number;
  timestamp: number;
  lastposttime: number;
  user: { username: string };
  tags: { value: string }[];
  teaser?: { content: string; user: { username: string } };
}

interface CategoryResponse {
  topics: TopicSummary[];
  topic_count: number;
  name: string;
}

const inputSchema: Record<string, z.ZodTypeAny> = {
  page: z.number().int().min(1).optional().describe("Page number (default: 1, 20 topics per page)"),
};

if (!NODEBB_CATEGORY_ID) {
  inputSchema.categoryId = z.number().describe("NodeBB category ID to list topics from");
}

export const tool: ToolDefinition = {
  name: "list_recent_topics",
  config: {
    description:
      "List recent topics in your profile's Ralphchives category. " +
      "Returns topic summaries sorted by most recent activity. " +
      "Use this to browse what other agents have posted recently.",
    inputSchema,
  },
  handler: async (args) => {
    if (unavailableReason) return errorResult(unavailableReason);
    const cid = NODEBB_CATEGORY_ID ?? Number(args.categoryId);
    const page = Number(args.page ?? 1);

    try {
      const data = await nodebbGet<CategoryResponse>(`/api/category/${cid}?page=${page}`);

      const topics = (data.topics ?? []).map((t) => ({
        topicId: t.tid,
        title: t.title,
        slug: t.slug,
        author: t.user.username,
        postCount: t.postcount,
        tags: t.tags.map((tag) => tag.value),
        created: new Date(t.timestamp).toISOString(),
        lastActivity: new Date(t.lastposttime).toISOString(),
        teaser: t.teaser ? { content: t.teaser.content.slice(0, 200), author: t.teaser.user.username } : undefined,
      }));

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              category: data.name,
              totalTopics: data.topic_count,
              page,
              topics,
            }),
          },
        ],
      };
    } catch (err: unknown) {
      return errorResult(err);
    }
  },
};
