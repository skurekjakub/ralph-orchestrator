#!/usr/bin/env npx tsx
/**
 * Run a profile variant's first stage once in the full container stack, with a direct prompt.
 *
 * Usage:
 *   npx tsx scripts/run-agent.ts <trigger> "<prompt>"
 *   npx tsx scripts/run-agent.ts @McpProbe "List all available MCP tools"
 *   npx tsx scripts/run-agent.ts @RalphAutocomplete "Explain the project structure"
 *
 * The script:
 * 1. Runs AppStartup (validation, MCP server builds, profile setup) and finds the variant matching the trigger
 * 2. Renders the variant's task artifacts (agents, skills, compose overlay, JIT MCP config) as a task does
 * 3. Creates a workspace from the profile's repoUrl, on a local branch `local-run-<timestamp>` from `main`
 * 4. Starts the stack, prepares the CLI homes, registers the log sources and runs the profile's setup script
 * 5. Runs the first stage's CLI, Claude Code or Copilot, on the prompt as given, without the task prompt template
 * 6. Collects logs and tears the stack down
 *
 * Logs are saved to output/logs/local-run-<timestamp>/; the workspace is kept at cache/workspaces/local-run-<timestamp>/.
 */
import "dotenv/config";
import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { AppStartup } from "../src/app-startup";
import { createCradle } from "../src/awilix-cradle";
import { consoleLogger } from "../src/logger";
import type { TaskContext } from "../src/services/task-context";
import { taskWorkspacePath } from "../src/services/task-workspace-manager";

const [trigger, ...promptParts] = process.argv.slice(2);
const prompt = promptParts.join(" ");

if (!trigger || !prompt) {
  console.error("Usage: npx tsx scripts/run-agent.ts <trigger> <prompt>");
  console.error('Example: npx tsx scripts/run-agent.ts @McpProbe "List all MCP tools"');
  process.exit(1);
}

async function main() {
  const logger = consoleLogger;

  logger.info("Running startup pipeline...");
  const config = await new AppStartup().run(logger);

  const profile = config.profiles.find((p) => p.match.commentTrigger.toLowerCase() === trigger.toLowerCase());
  if (!profile) {
    const available = config.profiles.map((p) => p.match.commentTrigger).join(", ");
    console.error(`No variant matches trigger "${trigger}". Available: ${available}`);
    process.exit(1);
  }
  const stage = profile.stages[0];
  logger.info(`Matched variant ${profile.variantKey}: stage ${stage.role} runs ${stage.agent} on ${stage.cli}`);

  const cradle = createCradle(config);
  const taskId = `local-run-${Date.now()}`;
  const outputDir = join(resolve(config.output.logDir), taskId);
  mkdirSync(outputDir, { recursive: true });
  const ctx: TaskContext = {
    workItem: {
      id: taskId,
      source: profile.dataSource,
      project: "",
      title: "Local run",
      description: prompt,
      status: "",
      type: "",
      priority: "",
      labels: [],
      components: [],
      created: new Date().toISOString(),
      updated: "",
      customFields: new Map(),
      sourceData: null,
    },
    profile,
    taskId,
    triggerParams: {},
    sourceBranch: "main",
    taskBranch: taskId,
    isRevision: false,
    ralphchivesEnabled: config.ralphchives.enabled,
    prUrl: null,
    outputDir,
    workspacePath: taskWorkspacePath(process.cwd(), taskId),
    signal: new AbortController().signal,
  };

  logger.info("Rendering the variant's task artifacts...");
  await cradle.profileSetup.prepareForTask(ctx);
  await cradle.workspaceManager.prepare(ctx);

  const container = cradle.containerFactory.create(profile, ctx.workspacePath);
  try {
    await container.start(ctx.signal);
    for (const layout of container.layouts) {
      await container.cleaner.prepareConfigDir(layout.configDir, layout.writableDirs);
    }
    await container.cleaner.cleanPaths(profile.cleanPaths);
    container.registerLogSources(taskId, taskId, outputDir);
    await container.setup();

    const executor = await container.createExecutorForStage(stage);
    logger.info(`Executing ${stage.agent}...`);
    const result = await executor.run(prompt);
    logger.info(`Agent finished: exit=${result.exitCode}, timedOut=${result.timedOut}`);

    logger.info("Collecting logs...");
    for (const { id, path } of await container.logs.collectAll()) {
      if (path) logger.info(`  ${id}: ${path}`);
    }
  } catch (err) {
    logger.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    logger.info("Tearing down containers...");
    await container.stop();
    logger.info(`Done; workspace kept at ${ctx.workspacePath}`);
  }
}

main().catch((err) => {
  console.error(`Fatal: ${err.message}`);
  process.exit(1);
});
