/**
 * Entity extraction — uses local Ollama LLM to extract structured entities from posts,
 * then writes them to Neo4j with MENTIONS relationships.
 */

import { Ollama } from "ollama";
import type { Driver } from "neo4j-driver";

const MODEL = "gemma3:8b";
const BATCH_SIZE = 10;

const ENTITY_TYPES = ["concept", "product", "error", "feature", "version", "library", "person"] as const;

type EntityType = (typeof ENTITY_TYPES)[number];

interface ExtractedEntity {
  name: string;
  type: EntityType;
  description: string;
}

const EXTRACTION_PROMPT = `Extract entities from the following text. Return a JSON array of objects with these fields:
- "name": the entity name (lowercase, normalized)
- "type": one of ${ENTITY_TYPES.join(", ")}
- "description": a brief one-line description

Only extract clearly identifiable entities. Return an empty array if none found.
Return ONLY the JSON array, no other text.

Text:
`;

export class EntityExtractor {
  private ollama: Ollama;

  constructor(
    private readonly driver: Driver,
    ollamaBaseUrl: string,
  ) {
    this.ollama = new Ollama({ host: ollamaBaseUrl });
  }

  /**
   * Find posts without extracted entities and process them.
   * Returns the number of posts processed.
   */
  async extractMissingEntities(): Promise<number> {
    const posts = await this.findPostsWithoutEntities();
    if (posts.length === 0) return 0;

    let processed = 0;
    for (let i = 0; i < posts.length; i += BATCH_SIZE) {
      const batch = posts.slice(i, i + BATCH_SIZE);

      for (const post of batch) {
        const entities = await this.extractFromText(post.content);
        if (entities.length > 0) {
          await this.writeEntities(post.pid, entities);
        }
        await this.markProcessed(post.pid);
      }

      processed += batch.length;
    }

    return processed;
  }

  private async extractFromText(text: string): Promise<ExtractedEntity[]> {
    // Truncate very long posts to avoid context window issues with 8B model
    const truncated = text.length > 4000 ? text.slice(0, 4000) : text;

    try {
      const response = await this.ollama.chat({
        model: MODEL,
        messages: [{ role: "user", content: EXTRACTION_PROMPT + truncated }],
        format: "json",
      });

      const parsed = JSON.parse(response.message.content);
      const entities: ExtractedEntity[] = [];

      // Validate each extracted entity
      const items = Array.isArray(parsed) ? parsed : (parsed.entities ?? []);
      for (const item of items) {
        if (
          typeof item.name === "string" &&
          typeof item.type === "string" &&
          ENTITY_TYPES.includes(item.type as EntityType)
        ) {
          entities.push({
            name: item.name.toLowerCase().trim(),
            type: item.type as EntityType,
            description: typeof item.description === "string" ? item.description : "",
          });
        }
      }

      return entities;
    } catch {
      // LLM failures are non-fatal — skip the post, it'll be retried next cycle
      return [];
    }
  }

  private async writeEntities(pid: number, entities: ExtractedEntity[]): Promise<void> {
    const session = this.driver.session();
    try {
      // Merge entities and create MENTIONS relationships
      await session.run(
        `
        UNWIND $entities AS e
        MERGE (entity:Entity {name: e.name, type: e.type})
        ON CREATE SET entity.description = e.description
        WITH entity, e
        MATCH (post:Post {pid: $pid})
        MERGE (post)-[:MENTIONS]->(entity)
        `,
        { pid, entities },
      );

      // Create RELATED_TO edges between entities co-occurring in this post
      if (entities.length > 1) {
        await session.run(
          `
          MATCH (p:Post {pid: $pid})-[:MENTIONS]->(e1:Entity)
          MATCH (p)-[:MENTIONS]->(e2:Entity)
          WHERE id(e1) < id(e2)
          MERGE (e1)-[r:RELATED_TO]-(e2)
          ON CREATE SET r.weight = 1
          ON MATCH SET r.weight = r.weight + 1
          `,
          { pid },
        );
      }
    } finally {
      await session.close();
    }
  }

  private async markProcessed(pid: number): Promise<void> {
    const session = this.driver.session();
    try {
      await session.run(`MATCH (p:Post {pid: $pid}) SET p.entitiesExtracted = true`, { pid });
    } finally {
      await session.close();
    }
  }

  private async findPostsWithoutEntities(): Promise<Array<{ pid: number; content: string }>> {
    const session = this.driver.session();
    try {
      const result = await session.run(`
        MATCH (p:Post)
        WHERE p.entitiesExtracted IS NULL AND p.content IS NOT NULL AND size(p.content) > 50
        RETURN p.pid AS pid, p.content AS content
        ORDER BY p.timestamp ASC
        LIMIT 200
      `);
      return result.records.map((r) => ({
        pid: Number(r.get("pid")),
        content: String(r.get("content")),
      }));
    } finally {
      await session.close();
    }
  }
}
