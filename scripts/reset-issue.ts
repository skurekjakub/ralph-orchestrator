#!/usr/bin/env npx tsx
/**
 * Reset a JIRA issue + local environment to a clean "To Do" state for testing.
 *
 * Usage:
 *   npx tsx scripts/reset-issue.ts                  # resets DOC-3143 (default, easy task)
 *   npx tsx scripts/reset-issue.ts DOC-3122         # resets a specific issue (easy task)
 *   npx tsx scripts/reset-issue.ts --medium         # medium: data caching patterns
 *   npx tsx scripts/reset-issue.ts --hard           # hard: content retrieval (schema-based)
 *   npx tsx scripts/reset-issue.ts --hard-admin     # hard: admin UI visibility condition example
 *   npx tsx scripts/reset-issue.ts --hard-cicd      # hard: advanced CI/CD serialization patterns
 *   npx tsx scripts/reset-issue.ts --very-hard      # very-hard: cross-type content retrieval
 *   npx tsx scripts/reset-issue.ts --very-hard-admin # very-hard: FormComponentExtender docs
 *   npx tsx scripts/reset-issue.ts DOC-3122 --hard
 *   npx tsx scripts/reset-issue.ts --trigger              # post "@Ralph" after reset
 *   npx tsx scripts/reset-issue.ts --trigger=@RalphDf     # post custom trigger comment
 */
import "dotenv/config";
import { resolve } from "node:path";
import type { ResetContext, JiraEnv, TaskDifficulty } from "./reset-testenv/types";
import {
  fetchIssue,
  deleteComments,
  deleteAttachments,
  resetFields,
  transitionToToDo,
  postComment,
} from "./reset-testenv/jira";
import { clearLedger, clearTriggerCache, clearLogFiles } from "./reset-testenv/local";
import { cleanBranches } from "./reset-testenv/git";
import { cleanContainers } from "./reset-testenv/docker";

const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const flags = process.argv.slice(2).filter((a) => a.startsWith("--"));

const issueKey = args[0] || "DOC-3143";
const triggerFlag = flags.find((f) => f === "--trigger" || f.startsWith("--trigger="));
const triggerComment = triggerFlag
  ? triggerFlag.includes("=")
    ? triggerFlag.split("=").slice(1).join("=")
    : "@Ralph"
  : null;

const difficulty: TaskDifficulty = flags.includes("--very-hard-admin")
  ? "very-hard-admin"
  : flags.includes("--very-hard")
    ? "very-hard"
    : flags.includes("--hard-cicd")
      ? "hard-cicd"
      : flags.includes("--hard-admin")
        ? "hard-admin"
        : flags.includes("--hard")
          ? "hard"
          : flags.includes("--medium")
            ? "medium"
            : "easy";

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
  console.log(`\n🔄 Resetting ${issueKey} to clean state (${difficulty} task)...\n`);

  console.log("1. Fetching issue...");
  const issue = await fetchIssue(issueKey, jiraEnv);
  console.log(`   Current status: ${issue.fields?.status?.name ?? "unknown"}`);

  console.log("\n2. Deleting comments...");
  await deleteComments(issueKey, issue, jiraEnv);

  console.log("\n3. Deleting attachments...");
  await deleteAttachments(issueKey, issue, jiraEnv);

  console.log("\n4. Updating fields...");
  await resetFields(issueKey, jiraEnv, difficulty);

  console.log("\n5. Transitioning to To Do...");
  await transitionToToDo(issueKey, jiraEnv);

  console.log("\n6. Clearing local state...");
  clearLedger(ctx);
  clearTriggerCache(ctx);
  clearLogFiles(ctx);

  console.log("\n7. Cleaning the issue's branches on the remote and its workspaces...");
  cleanBranches(ctx);

  console.log("\n8. Cleaning orphaned Docker containers...");
  cleanContainers();

  if (triggerComment) {
    console.log(`\n9. Posting trigger comment...`);
    await postComment(issueKey, triggerComment, jiraEnv);
  }

  console.log(`\n✅ ${issueKey} reset complete!\n`);
  console.log(`   View: https://kentico.atlassian.net/browse/${issueKey}\n`);
}

main().catch((err) => {
  console.error(`\n❌ Failed: ${err.message}\n`);
  process.exit(1);
});
