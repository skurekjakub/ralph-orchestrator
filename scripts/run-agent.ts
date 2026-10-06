#!/usr/bin/env npx tsx
/**
 * Run an agent profile variant locally with a direct prompt.
 *
 * Usage:
 *   npx tsx scripts/run-agent.ts <trigger> "<prompt>"
 *   npx tsx scripts/run-agent.ts @McpProbe "List all available MCP tools"
 *   npx tsx scripts/run-agent.ts @RalphAutocomplete "Explain the project structure"
 *
 * The script:
 * 1. Finds the variant matching the trigger string
 * 2. Runs AppStartup to generate .build/ files (MCP configs, overlays)
 * 3. Starts containers (app + sidecar + proxy)
 * 4. Executes the agent CLI with the provided prompt
 * 5. Collects logs and tears down
 *
 * Logs are saved to output/logs/ with prefix "local-run-<timestamp>".
 */
import "dotenv/config";
import { resolve, join } from "node:path";
import { existsSync, rmSync, mkdirSync } from "node:fs";
import { AppStartup } from "../src/app-startup.js";
import { ComposeClient } from "../src/container/compose-client.js";
import { ComposeFileResolver } from "../src/container/setup/compose-files.js";
import { CopilotExecutor } from "../src/container/cli-executors/copilot-executor.js";
import { COPILOT_CONTAINER_LAYOUT } from "../src/cli/copilot/copilot-layout.js";
import { StreamCapture } from "../src/container/stream-capture.js";
import { ContainerLogCollector, CaptureMode } from "../src/container/log-collector.js";
import { ContainerWorkspaceCleaner } from "../src/container/workspace-cleaner.js";
import { consoleLogger } from "../src/logger.js";

const [trigger, ...promptParts] = process.argv.slice(2);
const prompt = promptParts.join(" ");

if (!trigger || !prompt) {
  console.error("Usage: npx tsx scripts/run-agent.ts <trigger> <prompt>");
  console.error('Example: npx tsx scripts/run-agent.ts @McpProbe "List all MCP tools"');
  process.exit(1);
}

async function main() {
  const logger = consoleLogger;

  // 1. Run startup pipeline (validate, build MCP servers, generate configs)
  logger.info("Running startup pipeline...");
  const config = await new AppStartup().run(logger);

  // 2. Find matching variant
  const profile = config.profiles.find((p) => p.match.commentTrigger.toLowerCase() === trigger.toLowerCase());

  if (!profile) {
    const available = config.profiles.map((p) => p.match.commentTrigger).join(", ");
    console.error(`No variant matches trigger "${trigger}". Available: ${available}`);
    process.exit(1);
  }

  logger.info(`Matched variant: ${profile.displayName} (${profile.id}, cli: ${profile.cli})`);
  logger.info(`Model: ${profile.model ?? "default"}`);

  // 3. Create compose client
  const composeFiles = new ComposeFileResolver().resolve(profile);
  const profileSquid = resolve(process.cwd(), "profiles", profile.id, ".build/squid.conf");
  const squidConfPath = existsSync(profileSquid) ? profileSquid : resolve(process.cwd(), "shared/security/squid.conf");

  const compose = new ComposeClient(composeFiles, {
    targetRepoPath: profile.repoPath,
    squidConfPath,
  });

  // 4. Set up log collector
  const logs = new ContainerLogCollector(compose, config.output.logDir, logger);
  const issueKey = `local-run-${Date.now()}`;
  logs.setTaskId(issueKey);

  logs.addSource({
    id: "audit",
    service: "app",
    containerPath: profile.auditLogPath,
    extension: "jsonl",
    mode: CaptureMode.Collect,
  });
  logs.addSource({
    id: "transcript",
    service: "app",
    containerPath: COPILOT_CONTAINER_LAYOUT.transcriptPath,
    extension: "md",
    mode: CaptureMode.Collect,
  });
  logs.addSource({
    id: "proxy",
    service: "egress-proxy",
    containerPath: "/var/log/squid/access.log",
    extension: "log",
    mode: CaptureMode.Collect,
  });
  logs.addSource({
    id: "sidecar",
    service: "mcp-sidecar",
    containerPath: "",
    extension: "log",
    mode: CaptureMode.Collect,
    useComposeLogs: true,
  });

  const executor = new CopilotExecutor(compose, profile, logger);

  try {
    // 5. Clean .ralph directory on host before compose up
    const ralphDir = join(profile.repoPath, ".ralph");
    logger.info(`Cleaning ${ralphDir}...`);
    rmSync(ralphDir, { recursive: true, force: true });
    mkdirSync(ralphDir, { recursive: true });

    // 6. Start containers
    logger.info("Starting containers...");
    const buildProc = compose.compose(["up", "-d", "--build"]);
    new StreamCapture(buildProc, logger, "build");
    await buildProc;
    logger.info("Containers started");

    // 7. Health check
    await compose.checkDocker();

    // 8. Prepare workspace
    logger.info("Preparing workspace...");
    const cleaner = new ContainerWorkspaceCleaner(compose, logger);
    await cleaner.prepareConfigDir(COPILOT_CONTAINER_LAYOUT.configDir, COPILOT_CONTAINER_LAYOUT.writableDirs);
    await cleaner.cleanPaths(profile.cleanPaths);

    logs.attach();

    // 9. Run setup script
    logger.info("Running setup script...");
    const setupProc = compose.exec(["--user", "vscode", "app", profile.setupScript]);
    new StreamCapture(setupProc, logger, "setup");
    await setupProc;
    logger.info("Setup complete");

    // 10. Execute agent
    logger.info(`Executing ${profile.displayName} agent...`);
    const result = await executor.run(prompt);
    logger.info(`Agent finished: exit=${result.exitCode}, timedOut=${result.timedOut}`);

    // 11. Collect logs
    logger.info("Collecting logs...");
    const collected = await logs.collectAll();
    for (const { id, path } of collected) {
      if (path) logger.info(`  ${id}: ${path}`);
    }
  } catch (err) {
    logger.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    // 11. Teardown
    logger.info("Tearing down containers...");
    try {
      const downProc = compose.compose(["down", "--volumes", "--remove-orphans"]);
      new StreamCapture(downProc, logger, "down");
      await downProc;
    } catch {
      logger.warn("Teardown failed — containers may need manual cleanup");
    }
    logger.info("Done");
  }
}

main().catch((err) => {
  console.error(`Fatal: ${err.message}`);
  process.exit(1);
});
