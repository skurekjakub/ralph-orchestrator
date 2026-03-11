#!/usr/bin/env npx tsx
/**
 * Replay post-task hooks from a saved hook-manifest.json.
 *
 * Usage:
 *   npx tsx scripts/run-hooks.ts <outputDir>
 *   npx tsx scripts/run-hooks.ts output/logs/DOC-3189-1773218420974
 *   npx tsx scripts/run-hooks.ts output/logs/DOC-3189-1773218420974 --hook scientist
 *
 * The script:
 * 1. Reads hook-manifest.json from the given output directory
 * 2. Runs AppStartup to validate config and generate .build/ files
 * 3. Finds the matching profile by ID
 * 4. Builds a DI cradle for service access
 * 5. Executes hooks sequentially using local-only executors
 *
 * Pass --hook <name> to run only a specific hook instead of all.
 */
import "dotenv/config";
import { readFileSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { AppStartup } from "../src/app-startup.js";
import { createCradle } from "../src/awilix-cradle.js";
import { TaskStatus } from "../src/container/types.js";
import { consoleLogger } from "../src/logger.js";
import type { IPostTaskHook } from "../src/config/types.js";

interface HookManifest {
  taskId: string;
  workItemId: string;
  source: string;
  profileId: string;
  variantKey: string;
  triggerParams: Record<string, string>;
  isRevision: boolean;
  outputDir: string;
  status: string;
  collectedLogs: Record<string, string>;
  hooks: readonly IPostTaskHook[];
  createdAt: string;
}

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
  const manifestPath = join(absOutputDir, "hook-manifest.json");
  let manifest: HookManifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, "utf-8")) as HookManifest;
  } catch {
    console.error(`Cannot read hook manifest at ${manifestPath}`);
    process.exit(1);
  }

  logger.info(`Manifest loaded: task=${manifest.taskId}, profile=${manifest.profileId}, hooks=${manifest.hooks.length}`);

  // 2. Startup + config
  const config = await new AppStartup().run(logger);

  // 3. Find profile
  const profile = config.profiles.find((p) => p.id === manifest.profileId);
  if (!profile) {
    console.error(`Profile "${manifest.profileId}" not found. Available: ${config.profiles.map((p) => p.id).join(", ")}`);
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
  const ctx = {
    workItem: { id: manifest.workItemId, source: manifest.source, title: "", status: "", type: "", priority: "", labels: [], components: [], project: "", description: "", created: "", updated: "", customFields: new Map(), sourceData: null },
    profile,
    taskId: manifest.taskId,
    triggerParams: manifest.triggerParams,
    isRevision: manifest.isRevision,
    ralphchivesEnabled: config.ralphchives.enabled,
    prUrl: null,
    outputDir: absOutputDir,
    signal: new AbortController().signal,
    onToolOutput: undefined,
    onPreToolUse: undefined,
  };

  const result = {
    taskId: manifest.taskId,
    status: manifest.status as TaskStatus,
    durationMs: 0,
    exitCode: 0,
    stdout: "",
    stderr: "",
    collectedLogs: manifest.collectedLogs,
  };

  // 7. Execute hooks
  for (const hook of hooks) {
    const hookOutputDir = join(absOutputDir, "hooks", hook.name);
    mkdirSync(hookOutputDir, { recursive: true });

    logger.info(`[hook:${hook.name}] Starting (${hook.stages.length} stage${hook.stages.length > 1 ? "s" : ""})`);
    const completedRoles: string[] = [];

    try {
      for (let i = 0; i < hook.stages.length; i++) {
        const stage = hook.stages[i];
        const stageLabel = `[hook:${hook.name}/${stage.role}]`;

        logger.info(`${stageLabel} Rendering templates...`);
        await cradle.profileSetup.prepareForStage(ctx, {
          stageIndex: i,
          stageCount: hook.stages.length,
          stageRole: stage.role,
          stageMode: stage.mode,
          previousStageRoles: completedRoles,
          skills: stage.skills,
          hook: {
            collectedLogs: result.collectedLogs,
            name: hook.name,
            outputDir: hookOutputDir,
          },
        });

        const { executor, sessionRunner } = cradle.containerFactory.createLocalSession(profile, stage);

        logger.info(`${stageLabel} Executing ${stage.agent}...`);
        const stageResult = await sessionRunner.run(executor, ctx.workItem, { comments: [], isRevision: false, handoffContent: null, triggerParams: ctx.triggerParams }, {
          maxContinuations: 0,
          enableContinuation: false,
        });

        if (stageResult.status !== TaskStatus.Completed) {
          logger.warn(`${stageLabel} Failed (${stageResult.status}) — skipping remaining stages`);
          break;
        }

        completedRoles.push(stage.role);
        logger.info(`${stageLabel} Completed`);
      }

      logger.info(`[hook:${hook.name}] Finished`);
    } catch (err) {
      logger.warn(`[hook:${hook.name}] Unexpected error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  logger.info("Hook replay complete");
}

main().catch((err) => {
  console.error(`Fatal: ${err.message}`);
  process.exit(1);
});
