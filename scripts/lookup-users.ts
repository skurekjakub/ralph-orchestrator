#!/usr/bin/env npx tsx
/**
 * Look up JIRA user accountIds from issue comments.
 *
 * Usage:
 *   npx tsx scripts/lookup-users.ts <issueKey> [dataSourceKey]
 *   npx tsx scripts/lookup-users.ts DOC-3143
 *   npx tsx scripts/lookup-users.ts DOC-3143 kentico-jira
 *
 * Lists all unique commenters on the issue with their accountId and displayName.
 * Use the accountIds in config.json's dataSources.<key>.connection.allowedUsers array.
 */
import "dotenv/config";
import { loadConfig } from "../src/config/loader.js";
import { JiraClient } from "../src/datasource/connectors/jira/jira-client.js";
import type { IJiraConnectionConfig } from "../src/config/types.js";

const issueKey = process.argv[2];
const sourceKey = process.argv[3];

if (!issueKey) {
  console.error("Usage: npx tsx scripts/lookup-users.ts <issueKey> [dataSourceKey]");
  console.error("Example: npx tsx scripts/lookup-users.ts DOC-3143 kentico-jira");
  process.exit(1);
}

async function main() {
  const config = loadConfig();

  // Find the JIRA data source to use
  const jiraSources = Object.entries(config.dataSources).filter(([, ds]) => ds.type === "jira");
  if (jiraSources.length === 0) {
    console.error("No JIRA data sources configured in config.json");
    process.exit(1);
  }

  let selectedKey: string;
  if (sourceKey) {
    if (!config.dataSources[sourceKey]) {
      console.error(`Data source "${sourceKey}" not found. Available: ${jiraSources.map(([k]) => k).join(", ")}`);
      process.exit(1);
    }
    selectedKey = sourceKey;
  } else if (jiraSources.length === 1) {
    selectedKey = jiraSources[0][0];
  } else {
    console.error(`Multiple JIRA sources found. Specify one: ${jiraSources.map(([k]) => k).join(", ")}`);
    process.exit(1);
  }

  const conn = config.dataSources[selectedKey].connection as unknown as IJiraConnectionConfig;
  const client = new JiraClient({ connection: conn });

  console.log(`Using data source "${selectedKey}"`);
  console.log(`Fetching comments for ${issueKey}...\n`);
  const comments = await client.getComments(issueKey);

  if (comments.length === 0) {
    console.log("No comments found on this issue.");
    return;
  }

  const seen = new Map<string, string>();
  for (const comment of comments) {
    const { accountId, displayName } = comment.author;
    if (!seen.has(accountId)) {
      seen.set(accountId, displayName);
    }
  }

  console.log(`Found ${comments.length} comments from ${seen.size} unique users:\n`);
  console.log("accountId".padEnd(30) + "displayName");
  console.log("-".repeat(60));
  for (const [accountId, displayName] of seen) {
    console.log(`${accountId.padEnd(30)}${displayName}`);
  }

  console.log(`\nAdd accountIds to dataSources.${selectedKey}.connection.allowedUsers in config.json.`);
}

main().catch((err) => {
  console.error("Error:", err instanceof Error ? err.message : err);
  process.exit(1);
});
