/**
 * Neo4j graph writer — batch MERGE operations for structural forum data.
 * All operations are idempotent.
 */

import neo4j, { type Driver } from "neo4j-driver";
import type {
  NodeBBCategory,
  NodeBBTopic,
  NodeBBPost,
  NodeBBUser,
} from "./nodebb-fetcher.js";

const BATCH_SIZE = 500;

export class GraphWriter {
  private driver: Driver;

  constructor(uri: string, user: string, password: string) {
    this.driver = neo4j.driver(uri, neo4j.auth.basic(user, password));
  }

  async verifyConnectivity(): Promise<void> {
    await this.driver.verifyConnectivity();
  }

  async close(): Promise<void> {
    await this.driver.close();
  }

  async mergeCategories(categories: NodeBBCategory[]): Promise<number> {
    return this.batchMerge(categories, `
      UNWIND $batch AS c
      MERGE (cat:Category {cid: c.cid})
      SET cat.name = c.name,
          cat.description = c.description,
          cat.parentCid = c.parentCid,
          cat.slug = c.slug
      WITH cat, c
      WHERE c.parentCid > 0
      MATCH (parent:Category {cid: c.parentCid})
      MERGE (cat)-[:CHILD_OF]->(parent)
    `);
  }

  async mergeUsers(users: NodeBBUser[]): Promise<number> {
    return this.batchMerge(users, `
      UNWIND $batch AS u
      MERGE (user:User {uid: u.uid})
      SET user.username = u.username,
          user.reputation = u.reputation,
          user.joinDate = u.joindate,
          user.groupTitle = u.groupTitle
    `);
  }

  async mergeTopics(topics: NodeBBTopic[]): Promise<number> {
    return this.batchMerge(topics, `
      UNWIND $batch AS t
      MERGE (topic:Topic {tid: t.tid})
      SET topic.title = t.title,
          topic.timestamp = t.timestamp,
          topic.slug = t.slug,
          topic.postcount = t.postcount
      WITH topic, t
      MATCH (cat:Category {cid: t.cid})
      MERGE (topic)-[:IN_CATEGORY]->(cat)
      WITH topic, t
      MATCH (author:User {uid: t.uid})
      MERGE (author)-[:CREATED]->(topic)
    `);
  }

  async mergeTopicTags(topics: NodeBBTopic[]): Promise<number> {
    // Flatten topics into tag rows
    const tagRows = topics.flatMap((t) =>
      (t.tags ?? []).map((tag) => ({ tid: t.tid, tagName: tag.value })),
    );
    if (tagRows.length === 0) return 0;

    return this.batchMerge(tagRows, `
      UNWIND $batch AS row
      MERGE (tag:Tag {name: row.tagName})
      WITH tag, row
      MATCH (topic:Topic {tid: row.tid})
      MERGE (topic)-[:TAGGED]->(tag)
    `);
  }

  async mergePosts(posts: NodeBBPost[]): Promise<number> {
    return this.batchMerge(posts, `
      UNWIND $batch AS p
      MERGE (post:Post {pid: p.pid})
      SET post.content = p.content,
          post.timestamp = p.timestamp,
          post.votes = p.votes
      WITH post, p
      MATCH (topic:Topic {tid: p.tid})
      MERGE (post)-[:IN_TOPIC]->(topic)
      WITH post, p
      MATCH (author:User {uid: p.uid})
      MERGE (author)-[:POSTED]->(post)
      WITH post, p
      WHERE p.toPid IS NOT NULL
      MATCH (parent:Post {pid: p.toPid})
      MERGE (post)-[:REPLIES_TO]->(parent)
    `);
  }

  // ---- Sync state tracking ----

  async getSyncState(key: string): Promise<number> {
    const session = this.driver.session();
    try {
      const result = await session.run(
        `MATCH (s:SyncState {key: $key}) RETURN s.value AS value`,
        { key },
      );
      if (result.records.length === 0) return 0;
      const val = result.records[0].get("value");
      return typeof val === "number" ? val : Number(val);
    } finally {
      await session.close();
    }
  }

  async setSyncState(key: string, value: number): Promise<void> {
    const session = this.driver.session();
    try {
      await session.run(
        `MERGE (s:SyncState {key: $key}) SET s.value = $value`,
        { key, value },
      );
    } finally {
      await session.close();
    }
  }

  // ---- Internal ----

  private async batchMerge<T>(items: T[], cypher: string): Promise<number> {
    if (items.length === 0) return 0;

    let processed = 0;
    const session = this.driver.session();
    try {
      for (let i = 0; i < items.length; i += BATCH_SIZE) {
        const batch = items.slice(i, i + BATCH_SIZE);
        await session.run(cypher, { batch });
        processed += batch.length;
      }
    } finally {
      await session.close();
    }
    return processed;
  }
}
