#!/usr/bin/env npx tsx
/**
 * Replay post-task hooks from a saved hook-manifest.json.
 *
 * Usage:
 *   npx tsx scripts/run-hooks.ts <outputDir>
 *   npx tsx scripts/run-hooks.ts output/logs/DOC-3189-1773218420974
 *   npx tsx scripts/run-hooks.ts output/logs/DOC-3189-1773218420974 --hook run-analysis
 *
 * The script:
 * 1. Reads and validates hook-manifest.json in the given output directory
 * 2. Runs AppStartup to validate config and generate .build/ files
 * 3. Finds the variant the task ran by the manifest's variantKey
 * 4. Builds a DI cradle for service access
 * 5. Clears each replayed hook's output directory, then runs the hooks through the cradle's post-task hook runner
 *    on the analysed run the manifest recorded, with the work item's saved id, source, title and description
 *
 * Pass --hook <name> to run only a specific hook instead of all.
 */
import "dotenv/config";
import { rm } from "node:fs/promises";
import { resolve } from "node:path";
import { AppStartup } from "../src/app-startup";
import { createCradle } from "../src/awilix-cradle";
import { consoleLogger } from "../src/logger";
import { readHookManifest } from "../src/services/hook-manifest";
import { hookOutputDir } from "../src/services/stage-workspace";
import type { TaskContext } from "../src/services/task-context";
import { taskWorkspacePath } from "../src/services/task-workspace-manager";

// ── Parse args ────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
let outputDir: string | undefined;
let hookFilter: string | undefined;

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--hook" && args[i + 1]) {
    hookFilter = args[++i];
  } else if (!outputDir) {
    outputDir = args[i];
  }
}

if (!outputDir) {
  console.error("Usage: npx tsx scripts/run-hooks.ts <outputDir> [--hook <name>]");
  console.error("Example: npx tsx scripts/run-hooks.ts output/logs/DOC-3189-1773218420974");
  process.exit(1);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const logger = consoleLogger;
  const absOutputDir = resolve(process.cwd(), outputDir!);

  // 1. Read manifest
  const manifest = await readHookManifest(absOutputDir);
  logger.info(
    `Manifest loaded: task=${manifest.taskId}, variant=${manifest.variantKey}, hooks=${manifest.hooks.length}`,
  );

  // 2. Startup + config
  const config = await new AppStartup().run(logger);

  // 3. Find the variant the task ran
  const profile = config.profiles.find((p) => p.variantKey === manifest.variantKey);
  if (!profile) {
    console.error(
      `Variant "${manifest.variantKey}" not found. Available: ${config.profiles.map((p) => p.variantKey).join(", ")}`,
    );
    process.exit(1);
  }

  // 4. Build DI cradle
  const cradle = createCradle(config);

  // 5. Determine which hooks to run (manifest hooks, optionally filtered)
  let hooks = [...manifest.hooks];
  if (hookFilter) {
    hooks = hooks.filter((h) => h.name === hookFilter);
    if (!hooks.length) {
      const available = manifest.hooks.map((h) => h.name).join(", ");
      console.error(`Hook "${hookFilter}" not found in manifest. Available: ${available}`);
      process.exit(1);
    }
  }

  // 6. Build a minimal TaskContext from the manifest
  const ctx: TaskContext = {
    workItem: {
      ...manifest.workItem,
      status: "",
      type: "",
      priority: "",
      labels: [],
      components: [],
      project: "",
      created: "",
      updated: "",
      customFields: new Map(),
      sourceData: null,
    },
    profile,
    taskId: manifest.taskId,
    triggerParams: manifest.triggerParams,
    isRevision: manifest.isRevision,
    ralphchivesEnabled: config.ralphchives.enabled,
    prUrl: null,
    outputDir: absOutputDir,
    workspacePath: taskWorkspacePath(process.cwd(), manifest.taskId),
    signal: new AbortController().signal,
    onToolOutput: undefined,
    onPreToolUse: undefined,
    sourceBranch: "",
    taskBranch: "",
  };

  // 7. Clear what an earlier run of each hook left, then execute the hooks
  for (const hook of hooks) {
    await rm(hookOutputDir(absOutputDir, hook.name), { recursive: true, force: true });
  }
  await cradle.hookRunner.run(ctx, hooks, { collectedLogs: manifest.collectedLogs, clis: manifest.clis });

  logger.info("Hook replay complete");
}

main().catch((err) => {
  console.error(`Fatal: ${err.message}`);
  process.exit(1);
});
