#!/usr/bin/env npx tsx
/**
 * Reset a JIRA issue + local environment to a clean "To Do" state for testing.
 *
 * Usage:
 *   npx tsx scripts/reset-issue.ts              # resets DOC-3143 (default)
 *   npx tsx scripts/reset-issue.ts DOC-3122     # resets a specific issue
 */
import "dotenv/config";
import { resolve } from "node:path";
import type { ResetContext, JiraEnv } from "./reset-testenv/types.js";
import { fetchIssue, deleteComments, deleteAttachments, resetFields, transitionToToDo } from "./reset-testenv/jira.js";
import { clearLedger, clearTriggerCache, clearLogFiles } from "./reset-testenv/local.js";
import { cleanBranches } from "./reset-testenv/git.js";
import { cleanContainers } from "./reset-testenv/docker.js";

const issueKey = process.argv[2] || "DOC-3143";

const jiraEnv: JiraEnv = {
  email: process.env.JIRA_EMAIL || "",
  apiToken: process.env.JIRA_PAT || "",
  cloudId: "37df0bb1-cba3-49a3-a001-61b91bdd8c08",
};

if (!jiraEnv.email || !jiraEnv.apiToken) {
  console.error("❌ JIRA_EMAIL and JIRA_PAT must be set in .env");
  process.exit(1);
}

const ctx: ResetContext = {
  issueKey,
  rootDir: resolve(process.cwd()),
};

async function main() {
  console.log(`\n🔄 Resetting ${issueKey} to clean state...\n`);

  console.log("1. Fetching issue...");
  const issue = await fetchIssue(issueKey, jiraEnv);
  console.log(`   Current status: ${issue.fields?.status?.name ?? "unknown"}`);

  console.log("\n2. Deleting comments...");
  await deleteComments(issueKey, issue, jiraEnv);

  console.log("\n3. Deleting attachments...");
  await deleteAttachments(issueKey, issue, jiraEnv);

  console.log("\n4. Updating fields...");
  await resetFields(issueKey, jiraEnv);

  console.log("\n5. Transitioning to To Do...");
  await transitionToToDo(issueKey, jiraEnv);

  console.log("\n6. Clearing local state...");
  clearLedger(ctx);
  clearTriggerCache(ctx);
  clearLogFiles(ctx);

  console.log("\n7. Cleaning git branches in target repo...");
  cleanBranches(ctx);

  console.log("\n8. Cleaning orphaned Docker containers...");
  cleanContainers();

  console.log(`\n✅ ${issueKey} reset complete!\n`);
  console.log(`   View: https://kentico.atlassian.net/browse/${issueKey}\n`);
}

main().catch((err) => {
  console.error(`\n❌ Failed: ${err.message}\n`);
  process.exit(1);
});
