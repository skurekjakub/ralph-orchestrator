/**
 * Sync pipeline daemon — orchestrates NodeBB → Neo4j sync + enrichment.
 *
 * Modes:
 *   --full    Full sync (first run or reset)
 *   (default) Daemon mode — runs incremental sync on an interval
 */

import neo4j from "neo4j-driver";
import { NodeBBFetcher } from "./nodebb-fetcher.js";
import { GraphWriter } from "./graph-writer.js";
import { Embedder } from "./embedder.js";
import { EntityExtractor } from "./entity-extractor.js";

// ---------------------------------------------------------------------------
// Config from environment
// ---------------------------------------------------------------------------

function requiredEnv(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required environment variable: ${key}`);
  return val;
}

const config = {
  nodebbApiUrl: requiredEnv("NODEBB_API_URL"),
  nodebbApiToken: requiredEnv("NODEBB_API_TOKEN"),
  neo4jUri: requiredEnv("NEO4J_URI"),
  neo4jUser: requiredEnv("NEO4J_USER"),
  neo4jPassword: requiredEnv("NEO4J_PASSWORD"),
  ollamaBaseUrl: requiredEnv("OLLAMA_BASE_URL"),
  syncIntervalMs: Number(process.env.SYNC_INTERVAL_MS ?? "300000"), // 5 min default
};

// ---------------------------------------------------------------------------
// Timestamped logging
// ---------------------------------------------------------------------------

function log(msg: string): void {
  console.log(`${new Date().toISOString()} [sync] ${msg}`);
}

// ---------------------------------------------------------------------------
// Sync cycle
// ---------------------------------------------------------------------------

async function runSync(
  fetcher: NodeBBFetcher,
  writer: GraphWriter,
  embedder: Embedder,
  entityExtractor: EntityExtractor,
  fullSync: boolean,
): Promise<void> {
  const start = Date.now();

  // Phase 1: Structural sync
  log(fullSync ? "Starting full sync..." : "Starting incremental sync...");

  // Always sync categories (few items, cheap)
  const categories = await fetcher.fetchCategories();
  const catCount = await writer.mergeCategories(categories);
  log(`Merged ${catCount} categories`);

  // Fetch topics — full or incremental
  const lastSync = fullSync ? 0 : await writer.getSyncState("lastTopicTimestamp");
  const topics = await fetcher.fetchRecentTopics(lastSync);
  log(`Fetched ${topics.length} topics since ${lastSync}`);

  if (topics.length > 0) {
    // Collect unique user IDs
    const userIds = new Set<number>();
    topics.forEach((t) => userIds.add(t.uid));

    // Fetch and merge users
    const users = (
      await Promise.all([...userIds].map((uid) => fetcher.fetchUser(uid)))
    ).filter((u) => u !== null);
    await writer.mergeUsers(users);
    log(`Merged ${users.length} users`);

    // Merge topics + tags
    await writer.mergeTopics(topics);
    await writer.mergeTopicTags(topics);
    log(`Merged ${topics.length} topics with tags`);

    // Fetch and merge posts for each topic
    let totalPosts = 0;
    for (const topic of topics) {
      const posts = await fetcher.fetchTopicPosts(topic.tid);
      posts.forEach((p) => userIds.add(p.uid));
      await writer.mergePosts(posts);
      totalPosts += posts.length;
    }

    // Merge any new users discovered from posts
    const additionalUsers = (
      await Promise.all(
        [...userIds].map((uid) => fetcher.fetchUser(uid)),
      )
    ).filter((u) => u !== null);
    await writer.mergeUsers(additionalUsers);

    log(`Merged ${totalPosts} posts`);

    // Update high-water mark
    const maxTimestamp = Math.max(...topics.map((t) => t.timestamp));
    await writer.setSyncState("lastTopicTimestamp", maxTimestamp);
  }

  // Phase 2: Enrichment (embeddings + entity extraction)
  const embeddedCount = await embedder.embedMissingPosts();
  if (embeddedCount > 0) log(`Generated embeddings for ${embeddedCount} posts`);

  const extractedCount = await entityExtractor.extractMissingEntities();
  if (extractedCount > 0) log(`Extracted entities from ${extractedCount} posts`);

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  log(`Sync cycle completed in ${elapsed}s`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const fullSync = process.argv.includes("--full");

  log("Ralphchives sync pipeline starting...");
  log(`Neo4j: ${config.neo4jUri}`);
  log(`NodeBB: ${config.nodebbApiUrl}`);
  log(`Ollama: ${config.ollamaBaseUrl}`);
  log(`Mode: ${fullSync ? "full sync" : "daemon"}`);

  const fetcher = new NodeBBFetcher(config.nodebbApiUrl, config.nodebbApiToken);
  const writer = new GraphWriter(config.neo4jUri, config.neo4jUser, config.neo4jPassword);
  const driver = neo4j.driver(config.neo4jUri, neo4j.auth.basic(config.neo4jUser, config.neo4jPassword));
  const embedder = new Embedder(driver, config.ollamaBaseUrl);
  const entityExtractor = new EntityExtractor(driver, config.ollamaBaseUrl);

  await writer.verifyConnectivity();
  log("Connected to Neo4j");

  if (fullSync) {
    await runSync(fetcher, writer, embedder, entityExtractor, true);
    await writer.close();
    await driver.close();
    log("Full sync complete, exiting.");
    return;
  }

  // Daemon mode — run on interval
  const run = async () => {
    try {
      await runSync(fetcher, writer, embedder, entityExtractor, false);
    } catch (err) {
      log(`Sync error: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  // Initial sync
  await run();

  // Schedule recurring syncs
  log(`Scheduling sync every ${config.syncIntervalMs / 1000}s`);
  setInterval(run, config.syncIntervalMs);

  // Graceful shutdown
  const shutdown = async () => {
    log("Shutting down...");
    await writer.close();
    await driver.close();
    process.exit(0);
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
