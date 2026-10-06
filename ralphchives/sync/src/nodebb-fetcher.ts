/**
 * NodeBB API client — fetches forum data (categories, topics, posts, users).
 * Tracks high-water marks for incremental sync.
 */

export interface NodeBBCategory {
  cid: number;
  name: string;
  description: string;
  parentCid: number;
  slug: string;
}

export interface NodeBBTopic {
  tid: number;
  uid: number;
  cid: number;
  title: string;
  timestamp: number;
  slug: string;
  tags: Array<{ value: string }>;
  mainPid: number;
  postcount: number;
}

export interface NodeBBPost {
  pid: number;
  tid: number;
  uid: number;
  content: string;
  timestamp: number;
  votes: number;
  toPid: number | null;
}

export interface NodeBBUser {
  uid: number;
  username: string;
  reputation: number;
  joindate: number;
  groupTitle: string;
}

export class NodeBBFetcher {
  constructor(
    private readonly baseUrl: string,
    private readonly apiToken: string,
  ) {}

  async fetchCategories(): Promise<NodeBBCategory[]> {
    const data = await this.get<{ categories: NodeBBCategory[] }>("/api/categories");
    return data.categories ?? [];
  }

  async fetchTopicsInCategory(cid: number, page = 1): Promise<NodeBBTopic[]> {
    const data = await this.get<{ topics: NodeBBTopic[] }>(`/api/category/${cid}?page=${page}`);
    return data.topics ?? [];
  }

  async fetchTopicPosts(tid: number, page = 1): Promise<NodeBBPost[]> {
    const data = await this.get<{ posts: NodeBBPost[] }>(`/api/topic/${tid}?page=${page}`);
    return data.posts ?? [];
  }

  async fetchUser(uid: number): Promise<NodeBBUser | null> {
    try {
      return await this.get<NodeBBUser>(`/api/user/uid/${uid}`);
    } catch {
      return null;
    }
  }

  /**
   * Fetch all topics across all categories modified after the given timestamp.
   * NodeBB's /api/recent endpoint returns topics sorted by last activity.
   */
  async fetchRecentTopics(afterTimestamp: number): Promise<NodeBBTopic[]> {
    const topics: NodeBBTopic[] = [];
    let page = 1;
    const maxPages = 50; // safety limit

    while (page <= maxPages) {
      const data = await this.get<{ topics: NodeBBTopic[]; nextStart: number }>(`/api/recent?page=${page}`);
      const batch = data.topics ?? [];
      if (batch.length === 0) break;

      for (const t of batch) {
        if (t.timestamp > afterTimestamp) {
          topics.push(t);
        }
      }

      // NodeBB sorts by last activity — if the oldest topic in this page
      // was created before the high-water mark, all subsequent pages will
      // also be older, so we can stop paginating.
      const oldestInBatch = Math.min(...batch.map((t) => t.timestamp));
      if (oldestInBatch <= afterTimestamp) return topics;
      page++;
    }
    return topics;
  }

  private async get<T>(path: string): Promise<T> {
    const url = new URL(path, this.baseUrl);
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${this.apiToken}`,
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`NodeBB API error: ${response.status} ${response.statusText} for ${path}`);
    }

    return (await response.json()) as T;
  }
}
