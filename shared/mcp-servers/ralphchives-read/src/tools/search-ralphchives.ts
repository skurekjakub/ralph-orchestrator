import { z } from "zod";
import { type ToolDefinition, errorResult, nodebbGet, NODEBB_CATEGORY_ID, unavailableReason } from "../shared.js";

interface SearchPost {
  pid: number;
  tid: number;
  content: string;
  user: { username: string };
  topic: { title: string; slug: string };
  timestamp: number;
}

interface SearchResponse {
  posts: SearchPost[];
  matchCount: number;
}

const inputSchema: Record<string, z.ZodTypeAny> = {
  query: z.string().describe("Search query — matches against topic titles and post content"),
  limit: z.number().int().min(1).max(50).optional().describe("Max results to return (default: 10)"),
};

if (!NODEBB_CATEGORY_ID) {
  inputSchema.categoryId = z.number().describe("NodeBB category ID to search within");
}

export const tool: ToolDefinition = {
  name: "search_ralphchives",
  config: {
    description:
      "Search the Ralphchives knowledge archive for topics and posts matching a query. " +
      "Results are always scoped to your profile's category. Use this to find prior task " +
      "reports, observations, and discussions from your past incarnations.",
    inputSchema,
  },
  handler: async (args) => {
    if (unavailableReason) return errorResult(unavailableReason);
    const cid = NODEBB_CATEGORY_ID ?? Number(args.categoryId);
    const query = String(args.query);
    const limit = Number(args.limit ?? 10);

    try {
      const params = new URLSearchParams({
        term: query,
        in: "titlesposts",
        "categories[]": String(cid),
        searchIn: "titles,posts",
      });

      const data = await nodebbGet<SearchResponse>(`/api/search?${params.toString()}`);

      const results = data.posts.slice(0, limit).map((post) => ({
        topicId: post.tid,
        postId: post.pid,
        topicTitle: post.topic.title,
        topicSlug: post.topic.slug,
        author: post.user.username,
        snippet: post.content.length > 500 ? post.content.slice(0, 500) + "..." : post.content,
        timestamp: new Date(post.timestamp).toISOString(),
      }));

      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            matchCount: data.matchCount,
            returned: results.length,
            results,
          }),
        }],
      };
    } catch (err: unknown) {
      return errorResult(err);
    }
  },
};
