#!/usr/bin/env npx tsx
/**
 * Look up JIRA user accountIds from issue comments.
 *
 * Usage:
 *   npx tsx scripts/lookup-users.ts <issueKey>
 *   npx tsx scripts/lookup-users.ts DOC-3143
 *
 * Lists all unique commenters on the issue with their accountId and displayName.
 * Use the accountIds in config.json's `allowedUsers` array.
 */
import "dotenv/config";
import { loadConfig } from "../src/config.js";
import { JiraClient } from "../src/jira/client.js";

const issueKey = process.argv[2];

if (!issueKey) {
  console.error("Usage: npx tsx scripts/lookup-users.ts <issueKey>");
  console.error("Example: npx tsx scripts/lookup-users.ts DOC-3143");
  process.exit(1);
}

async function main() {
  const config = loadConfig();
  const client = new JiraClient(
    config.jira,
    config.secrets.jiraEmail,
    config.secrets.jiraPat,
  );

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

  console.log(`\nAdd accountIds to config.json "allowedUsers" to restrict trigger access.`);
}

main().catch((err) => {
  console.error("Error:", err instanceof Error ? err.message : err);
  process.exit(1);
});
