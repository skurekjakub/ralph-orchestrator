/**
 * Embedding pipeline — generates bge-m3 embeddings via Ollama and writes them to Neo4j.
 */

import { Ollama } from "ollama";
import type { Driver } from "neo4j-driver";

const MODEL = "bge-m3";
const BATCH_SIZE = 32;

export class Embedder {
  private ollama: Ollama;

  constructor(
    private readonly driver: Driver,
    ollamaBaseUrl: string,
  ) {
    this.ollama = new Ollama({ host: ollamaBaseUrl });
  }

  /**
   * Find posts without embeddings and generate them.
   * Returns the number of posts embedded.
   */
  async embedMissingPosts(): Promise<number> {
    const postsToEmbed = await this.findPostsWithoutEmbeddings();
    if (postsToEmbed.length === 0) return 0;

    let embedded = 0;
    for (let i = 0; i < postsToEmbed.length; i += BATCH_SIZE) {
      const batch = postsToEmbed.slice(i, i + BATCH_SIZE);
      const texts = batch.map((p) => p.content);

      const response = await this.ollama.embed({ model: MODEL, input: texts });

      const updates = batch.map((p, idx) => ({
        pid: p.pid,
        embedding: response.embeddings[idx],
      }));

      await this.writeEmbeddings(updates);
      embedded += batch.length;
    }

    return embedded;
  }

  private async findPostsWithoutEmbeddings(): Promise<Array<{ pid: number; content: string }>> {
    const session = this.driver.session();
    try {
      const result = await session.run(`
        MATCH (p:Post)
        WHERE p.embedding IS NULL AND p.content IS NOT NULL AND size(p.content) > 10
        RETURN p.pid AS pid, p.content AS content
        ORDER BY p.timestamp ASC
        LIMIT 500
      `);
      return result.records.map((r) => ({
        pid: Number(r.get("pid")),
        content: String(r.get("content")),
      }));
    } finally {
      await session.close();
    }
  }

  private async writeEmbeddings(
    updates: Array<{ pid: number; embedding: number[] }>,
  ): Promise<void> {
    const session = this.driver.session();
    try {
      await session.run(
        `
        UNWIND $updates AS row
        MATCH (p:Post {pid: row.pid})
        SET p.embedding = row.embedding
        `,
        { updates },
      );
    } finally {
      await session.close();
    }
  }
}
