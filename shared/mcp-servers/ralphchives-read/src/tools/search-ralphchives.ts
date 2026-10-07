import Fuse from "fuse.js";
import { z } from "zod";
import { type ToolDefinition, errorResult, nodebbGet, NODEBB_CATEGORY_ID, unavailableReason } from "../shared";

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

interface CategoryTopic {
  tid: number;
  title: string;
  slug: string;
  mainPid: number;
  teaser?: { content?: string; pid?: number; user?: { username: string } };
  user?: { username: string };
  tags?: { value: string }[];
  timestamp: number;
}

interface CategoryResponse {
  topics: CategoryTopic[];
  pagination: { currentPage: number; pageCount: number };
}

/** Unified shape for Fuse.js matching. */
interface SearchCandidate {
  tid: number;
  pid: number;
  title: string;
  content: string;
  tags: string;
  slug: string;
  author: string;
  timestamp: number;
}

/**
 * Fetch up to `maxPages` of recent topics from the category listing.
 * Provides titles + teasers as a fuzzy-searchable corpus even when
 * NodeBB's exact search returns nothing (e.g. query has a typo).
 */
async function fetchCategoryTopics(cid: number, maxPages = 50): Promise<SearchCandidate[]> {
  const candidates: SearchCandidate[] = [];

  for (let page = 1; page <= maxPages; page++) {
    try {
      const data = await nodebbGet<CategoryResponse>(`/api/category/${cid}?page=${page}`);

      for (const topic of data.topics ?? []) {
        candidates.push({
          tid: topic.tid,
          pid: topic.mainPid,
          title: topic.title,
          content: topic.teaser?.content ?? "",
          tags: (topic.tags ?? []).map((t) => t.value).join(" "),
          slug: topic.slug,
          author: topic.teaser?.user?.username ?? topic.user?.username ?? "unknown",
          timestamp: topic.timestamp,
        });
      }

      if (page >= data.pagination.pageCount) break;
    } catch {
      break;
    }
  }

  return candidates;
}

const inputShape: Record<string, z.ZodTypeAny> = {
  query: z.string().describe("Search query — fuzzy-matches against topic titles, tags, and post content"),
  limit: z.number().int().min(1).max(50).optional().describe("Max results to return (default: 10)"),
};

if (!NODEBB_CATEGORY_ID) {
  inputShape.categoryId = z.number().describe("NodeBB category ID to search within");
}

export const tool: ToolDefinition = {
  name: "search_ralphchives",
  config: {
    description:
      "Search the Ralphchives knowledge archive for topics and posts matching a query. " +
      "Matches against topic titles, tags, and post content with fuzzy/typo-tolerant matching. " +
      "Results are always scoped to your profile's category. Use this to find prior task " +
      "reports, observations, and discussions from your past incarnations.",
    inputSchema: z.object(inputShape),
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

      // Fetch from NodeBB search (exact/stem) and category listing (for fuzzy corpus) in parallel.
      // If the exact search fails (e.g. search plugin issue), continue with just the category topics.
      const [searchData, categoryTopics] = await Promise.all([
        nodebbGet<SearchResponse>(`/api/search?${params.toString()}`).catch(
          () => ({ posts: [], matchCount: 0 }) as SearchResponse,
        ),
        fetchCategoryTopics(cid),
      ]);

      // Convert search results to unified candidates
      const searchCandidates: SearchCandidate[] = searchData.posts.map((post) => ({
        tid: post.tid,
        pid: post.pid,
        title: post.topic.title,
        content: post.content,
        tags: "",
        slug: post.topic.slug,
        author: post.user.username,
        timestamp: post.timestamp,
      }));

      // Merge — category topics first (they include tags), then search results
      // (which have full post content). Dedup by tid.
      const seen = new Set<number>();
      const merged: SearchCandidate[] = [];
      for (const c of [...categoryTopics, ...searchCandidates]) {
        if (!seen.has(c.tid)) {
          seen.add(c.tid);
          merged.push(c);
        }
      }

      // Fuzzy rank with Fuse.js — title weighted 2x over content.
      // Automatically OR every whitespace-separated word so each term
      // independently matches (e.g. "migration jekyll" → "migration" OR "jekyll").
      const fuse = new Fuse(merged, {
        keys: [
          { name: "title", weight: 2 },
          { name: "tags", weight: 2 },
          { name: "content", weight: 1 },
        ],
        threshold: 0.4,
        distance: 200,
        includeScore: true,
        useExtendedSearch: true,
      });

      // Build OR expression: split on whitespace, join with " | "
      const orQuery = query.trim().split(/\s+/).join(" | ");
      const fuzzyResults = fuse.search(orQuery, { limit });

      const results = fuzzyResults.map((r) => ({
        topicId: r.item.tid,
        postId: r.item.pid,
        topicTitle: r.item.title,
        topicSlug: r.item.slug,
        author: r.item.author,
        snippet: r.item.content.length > 500 ? r.item.content.slice(0, 500) + "..." : r.item.content,
        timestamp: new Date(r.item.timestamp).toISOString(),
      }));

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              matchCount: searchData.matchCount,
              returned: results.length,
              results,
            }),
          },
        ],
      };
    } catch (err: unknown) {
      return errorResult(err);
    }
  },
};
