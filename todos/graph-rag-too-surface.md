// ============================================================
// MCP Tool Surface for Neo4j Forum GraphRAG
// Protocol: Model Context Protocol (MCP)
// Data source: NodeBB forum backed by Neo4j + vector index
// ============================================================

// ─── TIER 1: SEARCH & RETRIEVAL ─────────────────────────────
// These are the primary tools an LLM agent would call most often.

/**
 * Hybrid semantic + graph search. The workhorse tool.
 * Runs vector similarity on post embeddings, then enriches
 * results with graph context (thread, author, category).
 */
tool("forum_search", {
  description:
    "Search forum posts using semantic similarity, optionally filtered " +
    "by category, tag, author, or date range. Returns posts with full " +
    "thread context, author info, and relevance scores.",
  inputSchema: {
    query: { type: "string", description: "Natural language search query" },
    filters: {
      type: "object",
      properties: {
        category: { type: "string", description: "Category name or ID" },
        tags: { type: "array", items: { type: "string" } },
        author: { type: "string", description: "Username" },
        dateFrom: { type: "string", format: "date", description: "ISO date" },
        dateTo: { type: "string", format: "date", description: "ISO date" },
        minVotes: { type: "integer", description: "Minimum post score" },
        resolved: { type: "boolean", description: "Only resolved topics" },
      },
    },
    topK: { type: "integer", default: 5, description: "Number of results" },
    includeReplies: { type: "boolean", default: true },
  },
  // Returns: Post[], each with { content, score, topic, category,
  //          author { username, reputation }, replies[] }
});

/**
 * Get the full thread context for a specific topic.
 * Useful when the LLM finds a relevant post and needs
 * the complete conversation to answer properly.
 */
tool("get_thread", {
  description:
    "Retrieve a complete forum thread by topic ID, including all posts " +
    "in chronological order with author info and vote counts.",
  inputSchema: {
    topicId: { type: "string" },
    maxPosts: { type: "integer", default: 50 },
  },
  // Returns: { topic, category, posts[] with authors and votes }
});


// ─── TIER 2: GRAPH EXPLORATION ──────────────────────────────
// Let the LLM navigate the knowledge graph structure.

/**
 * Find related topics through graph connections — shared tags,
 * shared authors, entity co-occurrence, or reply chains.
 */
tool("find_related_topics", {
  description:
    "Given a topic ID, find related topics via shared tags, shared " +
    "authors, mentioned entities, or cross-references. Returns " +
    "topics ranked by connection strength.",
  inputSchema: {
    topicId: { type: "string" },
    relationTypes: {
      type: "array",
      items: {
        type: "string",
        enum: ["shared_tags", "shared_authors", "shared_entities", "cross_referenced"],
      },
      default: ["shared_tags", "shared_entities"],
    },
    maxResults: { type: "integer", default: 10 },
  },
});

/**
 * Look up an entity extracted from forum content and find
 * everything the forum knows about it.
 */
tool("entity_lookup", {
  description:
    "Look up a concept, product, error code, or other entity in the " +
    "knowledge graph. Returns the entity, its relationships, and the " +
    "posts that mention it.",
  inputSchema: {
    entity: { type: "string", description: "Entity name (fuzzy matched)" },
    entityType: {
      type: "string",
      enum: ["concept", "product", "error", "person", "any"],
      default: "any",
    },
    maxPosts: { type: "integer", default: 10 },
  },
  // Returns: { entity, type, relatedEntities[], posts[] }
});

/**
 * Find the most knowledgeable users on a topic/category.
 * Based on graph centrality — post count, votes received,
 * accepted answers, reply depth.
 */
tool("find_experts", {
  description:
    "Find users with the most expertise on a given topic, category, " +
    "or entity. Ranks by post quality, accepted answers, and " +
    "community reputation in that area.",
  inputSchema: {
    topic: { type: "string", description: "Topic area or entity name" },
    category: { type: "string", optional: true },
    maxResults: { type: "integer", default: 5 },
  },
  // Returns: User[] with { username, reputation, postCount,
  //          acceptedAnswers, topPosts[] }
});


// ─── TIER 3: AGGREGATION & INSIGHT ──────────────────────────
// Higher-level tools for summarization and pattern detection.

/**
 * Get community-level summaries. Uses pre-computed Leiden/Louvain
 * communities + LLM-generated summaries (Microsoft GraphRAG style).
 */
tool("community_summary", {
  description:
    "Get a thematic summary of a topic cluster or category. Uses " +
    "pre-computed community detection to identify discussion themes, " +
    "common problems, and consensus solutions.",
  inputSchema: {
    scope: {
      type: "string",
      enum: ["category", "tag", "entity_cluster"],
    },
    scopeValue: { type: "string", description: "Category name, tag, or entity" },
    timeRange: {
      type: "string",
      enum: ["last_week", "last_month", "last_quarter", "all_time"],
      default: "last_month",
    },
  },
  // Returns: { summary, topThemes[], commonProblems[],
  //           frequentSolutions[], activeContributors[] }
});

/**
 * Trending / emerging topics detection.
 * Surfaces new entities or discussion patterns appearing
 * in recent posts that weren't present before.
 */
tool("trending_topics", {
  description:
    "Identify trending or emerging discussion topics based on recent " +
    "post activity, new entity appearances, and velocity of engagement.",
  inputSchema: {
    category: { type: "string", optional: true },
    timeRange: {
      type: "string",
      enum: ["last_day", "last_week", "last_month"],
      default: "last_week",
    },
    maxResults: { type: "integer", default: 10 },
  },
  // Returns: TrendingTopic[] with { topic, velocity, postCount,
  //          representativePost, relatedEntities[] }
});


// ─── TIER 4: WRITE-BACK (optional, gated) ───────────────────
// Only if you want the agent to mutate the graph.

/**
 * Tag a post or topic with additional metadata.
 * Useful for letting the AI agent curate/organize content.
 */
tool("tag_content", {
  description:
    "Add a tag or label to a post or topic. Requires confirmation. " +
    "Used for AI-assisted content curation.",
  inputSchema: {
    targetType: { type: "string", enum: ["post", "topic"] },
    targetId: { type: "string" },
    tags: { type: "array", items: { type: "string" } },
  },
  // Requires: write permission scope
});

/**
 * Submit a synthesized answer back to the forum.
 * The agent can draft an answer based on GraphRAG retrieval.
 */
tool("draft_answer", {
  description:
    "Draft a synthesized answer for a forum topic based on related " +
    "posts and knowledge graph context. Returns draft for human review, " +
    "does NOT auto-post.",
  inputSchema: {
    topicId: { type: "string" },
    context: { type: "string", description: "Additional context or constraints" },
  },
  // Returns: { draft, sourcePostIds[], confidence }
});


// ─── MCP RESOURCES (read-only context) ──────────────────────
// Exposed as MCP resources, not tools. The LLM can read these
// for grounding without making explicit tool calls.

resource("forum://schema", {
  description: "The forum's graph schema — node types, relationship types, properties",
  mimeType: "application/json",
});

resource("forum://categories", {
  description: "List of all forum categories with post counts",
  mimeType: "application/json",
});

resource("forum://tags/popular", {
  description: "Top 50 most-used tags with counts",
  mimeType: "application/json",
});

resource("forum://stats", {
  description: "Forum-level stats: total posts, users, topics, avg response time",
  mimeType: "application/json",
});