import { z } from "zod";
import { type ToolDefinition, errorResult, nodebbGet, unavailableReason } from "../shared.js";

interface PostData {
  pid: number;
  content: string;
  timestamp: number;
  user: { username: string; uid: number };
}

interface TopicData {
  tid: number;
  title: string;
  slug: string;
  category: { cid: number; name: string };
  tags: { value: string }[];
  posts: PostData[];
  postcount: number;
  timestamp: number;
  lastposttime: number;
}

export const tool: ToolDefinition = {
  name: "get_topic",
  config: {
    description:
      "Retrieve the full contents of a Ralphchives topic by ID, including all posts/replies. " +
      "Use this after searching to read the full context of a matching result.",
    inputSchema: {
      topicId: z.number().int().describe("Topic ID to retrieve"),
    },
  },
  handler: async (args) => {
    if (unavailableReason) return errorResult(unavailableReason);
    const tid = Number(args.topicId);

    try {
      const topic = await nodebbGet<TopicData>(`/api/topic/${tid}`);

      const posts = topic.posts.map((p) => ({
        postId: p.pid,
        author: p.user.username,
        content: p.content,
        timestamp: new Date(p.timestamp).toISOString(),
      }));

      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            topicId: topic.tid,
            title: topic.title,
            slug: topic.slug,
            category: topic.category.name,
            tags: topic.tags.map((t) => t.value),
            postCount: topic.postcount,
            created: new Date(topic.timestamp).toISOString(),
            lastPost: new Date(topic.lastposttime).toISOString(),
            posts,
          }),
        }],
      };
    } catch (err: unknown) {
      return errorResult(err);
    }
  },
};
