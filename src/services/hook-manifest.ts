import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { postTaskHookSchema, stageSchema } from "../config/schemas";
import { CliType } from "../config/types";
import { TaskStatus } from "../container/types";
import { toErrorMessage } from "../util/error";
import type { AnalysedRun } from "./post-task-hook-runner";
import type { TaskContext } from "./task-context";

/** The hook manifest's file name in the task's output directory. */
const HOOK_MANIFEST_FILE = "hook-manifest.json";

/** A post-task hook as the variant resolved it: every stage with its CLI and result contract. */
const resolvedHookSchema = postTaskHookSchema.extend({
  stages: z.array(stageSchema.extend({ cli: z.enum(CliType), requireResultBlock: z.boolean() })).min(1),
});

/** What replays a task's post-task hooks as the task would have run them: `hook-manifest.json`. */
const hookManifestSchema = z.object({
  taskId: z.string().min(1),
  /** The fields of the work item the hook templates show. */
  workItem: z.object({
    id: z.string().min(1),
    source: z.string().min(1),
    title: z.string(),
    description: z.string(),
  }),
  profileId: z.string().min(1),
  /** The variant the task ran, which the replay runs the hooks for. */
  variantKey: z.string().min(1),
  triggerParams: z.record(z.string(), z.string()),
  isRevision: z.boolean(),
  outputDir: z.string(),
  status: z.enum(TaskStatus),
  /** The analysed run: its collected logs, keyed by log source id. */
  collectedLogs: z.record(z.string(), z.string()),
  /** The analysed run: every CLI its stages ran, in stage order. */
  clis: z.array(z.enum(CliType)).min(1),
  hooks: z.array(resolvedHookSchema),
  createdAt: z.string(),
});

/** A parsed `hook-manifest.json`. */
export type HookManifest = z.infer<typeof hookManifestSchema>;

/**
 * The manifest a replay runs the task's post-task hooks from: the task, its work item, its variant and hooks, and
 * `run`, the run they analyse.
 *
 * @param status The task's final status.
 */
export function buildHookManifest(ctx: TaskContext, run: AnalysedRun, status: TaskStatus): HookManifest {
  const { workItem, profile } = ctx;
  return {
    taskId: ctx.taskId,
    workItem: { id: workItem.id, source: workItem.source, title: workItem.title, description: workItem.description },
    profileId: profile.id,
    variantKey: profile.variantKey,
    triggerParams: { ...ctx.triggerParams },
    isRevision: ctx.isRevision,
    outputDir: ctx.outputDir,
    status,
    collectedLogs: { ...run.collectedLogs },
    clis: [...run.clis],
    hooks: profile.postTaskHooks.map((hook) => ({
      name: hook.name,
      stages: hook.stages.map((stage) => ({ ...stage, skills: [...stage.skills] })),
    })),
    createdAt: new Date().toISOString(),
  };
}

/**
 * Writes `manifest` to `<outputDir>/hook-manifest.json`.
 *
 * @returns The manifest's path.
 * @throws Error when the file cannot be written.
 */
export async function writeHookManifest(outputDir: string, manifest: HookManifest): Promise<string> {
  const path = join(outputDir, HOOK_MANIFEST_FILE);
  await writeFile(path, JSON.stringify(manifest, null, 2) + "\n", "utf-8");
  return path;
}

/**
 * Reads the hook manifest in `outputDir`.
 *
 * @throws Error naming the manifest's path when it is missing, unreadable, not JSON, or not a hook manifest.
 */
export async function readHookManifest(outputDir: string): Promise<HookManifest> {
  const path = join(outputDir, HOOK_MANIFEST_FILE);
  const text = await readFile(path, "utf-8").catch((err: NodeJS.ErrnoException) => {
    if (err.code === "ENOENT")
      throw new Error(`No hook manifest at ${path}: only a task run with skip_hooks writes one`);
    throw new Error(`Cannot read the hook manifest at ${path}: ${toErrorMessage(err)}`);
  });
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (err) {
    throw new Error(`Hook manifest ${path} is not valid JSON: ${toErrorMessage(err)}`);
  }
  const parsed = hookManifestSchema.safeParse(json);
  if (!parsed.success) {
    throw new Error(`Hook manifest ${path} is malformed:\n${z.prettifyError(parsed.error)}`);
  }
  return parsed.data;
}
