#!/usr/bin/env npx tsx
/**
 * Shape a JIRA task before autonomous agent execution.
 *
 * Fetches the JIRA issue, builds a context-rich prompt with repo pointers,
 * and launches an interactive CLI session in the target repo. The shaping
 * agent explores the repo, interrogates gaps in the task, and produces a
 * structured readiness assessment.
 *
 * Usage:
 *   npx tsx scripts/shape-task.ts <issue-key>
 *   npx tsx scripts/shape-task.ts DOC-3200
 *   npx tsx scripts/shape-task.ts DOC-3200 --profile ralph-docs
 */
import "dotenv/config";
import { resolve, dirname, join } from "node:path";
import { readFileSync, mkdirSync, writeFileSync, unlinkSync, rmdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { execa } from "execa";
import { loadConfig } from "../src/config/loader.js";
import { JiraClient } from "../src/datasource/connectors/jira/jira-client.js";
import { JiraConnector } from "../src/datasource/connectors/jira/jira-connector.js";
import { buildPrompt } from "../src/prompt/prompt.js";
import type { IJiraConnectionConfig, IAgentProfile } from "../src/config/types.js";
import { CliType } from "../src/container/types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Args ────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const issueKey = args.find((a) => !a.startsWith("--"));
const profileIdx = args.indexOf("--profile");
const profileHint = args.find((a) => a.startsWith("--profile="))?.split("=")[1]
  ?? (profileIdx >= 0 ? args[profileIdx + 1] : undefined);

if (!issueKey) {
  console.error("Usage: npx tsx scripts/shape-task.ts <issue-key> [--profile <id>]");
  console.error("Example: npx tsx scripts/shape-task.ts DOC-3200");
  process.exit(1);
}

const project = issueKey.split("-")[0];

// ── Config ──────────────────────────────────────────────────────────────────
console.log("Loading config...");
const config = loadConfig();

// ── Profile match ───────────────────────────────────────────────────────────
function findProfile(): IAgentProfile {
  const candidates = config.profiles.filter((p) => {
    if (profileHint && p.id !== profileHint) return false;
    return p.match.projects.some((proj) => proj.toUpperCase() === project.toUpperCase());
  });

  if (candidates.length === 0) {
    const available = [...new Set(config.profiles.map((p) => p.id))].join(", ");
    console.error(`No profile matches project "${project}". Available profiles: ${available}`);
    process.exit(1);
  }

  // Prefer the first non-revision variant (the "main" writer agent)
  const primary = candidates.find((p) =>
    !p.displayName.includes("reviewer") && !p.displayName.includes("researcher")
  );
  return primary ?? candidates[0];
}

const profile = findProfile();
console.log(`Profile: ${profile.id} (${profile.displayName}, cli: ${profile.cli})`);
console.log(`Repo: ${profile.repoPath}`);

// ── JIRA fetch ──────────────────────────────────────────────────────────────
function createJiraConnector(): JiraConnector {
  const dsConfig = config.dataSources[profile.dataSource];
  if (!dsConfig) {
    console.error(`Data source "${profile.dataSource}" not found in config.json`);
    process.exit(1);
  }

  const envKey = profile.dataSource.toUpperCase().replace(/-/g, "_");
  const apiToken = process.env[`JIRA_PAT_${envKey}`];
  const email = process.env[`JIRA_EMAIL_${envKey}`];
  if (!apiToken || !email) {
    console.error(`JIRA_PAT_${envKey} and JIRA_EMAIL_${envKey} must be set in .env`);
    process.exit(1);
  }

  const conn = dsConfig.connection as Record<string, unknown>;
  const connection: IJiraConnectionConfig = {
    baseUrl: conn.baseUrl as string,
    cloudId: conn.cloudId as string,
    excludeFields: (conn.excludeFields as string[]) ?? [],
    allowedUsers: (conn.allowedUsers as string[]) ?? [],
    email,
    apiToken,
  };

  const client = new JiraClient({ connection });
  return new JiraConnector(profile.dataSource, client);
}

console.log(`\nFetching ${issueKey} from JIRA...`);
const connector = createJiraConnector();
const workItem = await connector.refreshWorkItem(issueKey);
const rawComments = await connector.getComments(issueKey);

console.log(`  Title: ${workItem.title}`);
console.log(`  Status: ${workItem.status}`);
console.log(`  Type: ${workItem.type}`);
if (workItem.labels.length > 0) console.log(`  Labels: ${workItem.labels.join(", ")}`);
if (workItem.components.length > 0) console.log(`  Components: ${workItem.components.join(", ")}`);
console.log(`  Comments: ${rawComments.length}`);

// ── Build prompt ────────────────────────────────────────────────────────────
const formattedComments = rawComments.map((c) =>
  `[${c.created}] ${c.authorName}:\n${c.body.trim()}`
);

const taskPrompt = buildPrompt(workItem, {
  comments: formattedComments,
  isRevision: false,
});

const agentSource = resolve(__dirname, "shape.agent.md");

const shapingPrompt = [
  "",
  "---",
  "",
  "# Task to Shape",
  "",
  taskPrompt,
  "",
  "---",
  "",
  "# Target Repository",
  "",
  `**Path**: ${profile.repoPath}`,
  `**Profile**: ${profile.id} (agent: ${profile.displayName})`,
  "",
  "The entire repository is available on disk at the path above. Explore it freely.",
  "",
  "Start by understanding the task, then explore the repo to find the relevant area,",
  "then systematically interrogate any gaps. Produce your readiness assessment when done.",
].join("\n");

// ── Deploy agent file to target repo ────────────────────────────────────────
const agentDir = join(profile.repoPath, ".github", "agents");
const agentDest = join(agentDir, "shape.agent.md");
const createdAgentDir = !existsSync(agentDir);
mkdirSync(agentDir, { recursive: true });
writeFileSync(agentDest, readFileSync(agentSource));

// ── Launch CLI ──────────────────────────────────────────────────────────────
console.log(`\nLaunching ${profile.cli} CLI in ${profile.repoPath}...\n`);
console.log("─".repeat(60));

const cliArgs = profile.cli === CliType.Copilot
  ? [
      "copilot",
      "-p", shapingPrompt,
      "--model", profile.model ?? "claude-opus-4.6",
      "--agent", "shape",
      "--allow-all-tools",
      "--allow-all-paths",
    ]
  : [
      "claude",
      "-p", shapingPrompt,
      "--dangerously-skip-permissions",
      "--append-system-prompt", `${agentSource}`
    ];

const [bin, ...flags] = cliArgs;

try {
  await execa(bin, flags, {
    cwd: profile.repoPath,
    stdio: "inherit",
    env: { ...process.env },
  });
} catch (err: unknown) {
  // User Ctrl+C or CLI exits non-zero — both are fine
  if (err instanceof Error && "exitCode" in err && (err as { exitCode: number }).exitCode === 130) {
    // SIGINT — user quit intentionally
  } else {
    console.error(`\nCLI exited with error: ${err instanceof Error ? err.message : String(err)}`);
  }
} finally {
  // Clean up the deployed agent file
  try {
    unlinkSync(agentDest);
    if (createdAgentDir) rmdirSync(agentDir);
  } catch { /* best-effort cleanup */ }
}

console.log("─".repeat(60));
console.log("Shaping session ended.");
