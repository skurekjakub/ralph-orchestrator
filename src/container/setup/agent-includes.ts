import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { Liquid } from "liquidjs";
import type { Logger } from "../../logger.js";
import { normalizeContent } from "../../prompt/normalizer.js";
import { registerCustomTags } from "./liquid-tags.js";
import { TaskContext } from "../../services/task-context.js";

/**
 * Render agent templates to resolved `.agent.md` files in `.build/`.
 *
 * Reads `.agent.md` templates from agentDir, renders Liquid tags
 * (e.g. `{% render 'name' %}`) using partials from includesDir, and
 * writes the output to the profile's `.build/` directory.
 *
 * The context object is passed to Liquid's renderer, making all keys
 * available as template variables (e.g. `{{ repo }}`, `{{ isRevision }}`).
 *
 * The `.build/` directory is what Docker compose should mount. The
 * `.agent.md` files in agentDir are the source of truth.
 */
export async function resolveAgentIncludes(
  agentDir: string,
  includesDir: string,
  context: Record<string, unknown>,
  logger?: Logger,
): Promise<void> {
  const profileDir = dirname(agentDir);
  const buildDir = join(profileDir, ".build");
  await mkdir(buildDir, { recursive: true });

  const engine = new Liquid({
    root: [includesDir],
    extname: ".md",
    globals: context,
  });
  registerCustomTags(engine);

  const allFiles = await readdir(agentDir);
  const templates = allFiles.filter((f) => f.endsWith(".agent.md"));

  for (const file of templates) {
    const templatePath = join(agentDir, file);
    const content = await readFile(templatePath, "utf-8");
    logger?.info(`  → ${file}: rendering`);
    const rendered = await engine.parseAndRender(content, context);
    await writeFile(join(buildDir, file), rendered, "utf-8");
    logger?.info(`  → ${file}: rendered`);
  }
}

/**
 * Template variables available to agent `.agent.md` templates.
 *
 * Built from the parsed profile config and the current work item,
 * so templates can tailor instructions per-task (e.g. `{% if isRevision %}`,
 * `{% if taskProject == "DOC" %}`).
 */
export interface TemplateContext {
  /** Allow Liquid to access any property — known fields are typed below. */
  [key: string]: unknown;

  /** Profile directory name (e.g. `ralph-docs`). */
  profileId: string;
  /** Absolute path to the target repository on the host. */
  repo: string;
  /**
   * Alias for `repo` — absolute path to the target repository.
   *
   * Useful in local-mode stages where the CLI runs in the orchestrator repo
   * and needs an explicit reference to the target repo the container agents work in.
   */
  targetRepoPath: string;
  /** CLI type (`copilot` or `claude`). */
  cli: string;
  /** Model override, or empty string when using CLI default. */
  model: string;
  /** Raw agent name as registered by the CLI (e.g. `ralph.ralph`). */
  agentName: string;
  /** Human-friendly agent name (e.g. `ralph`). */
  displayName: string;
  /** MCP servers deployed for this profile. */
  mcpServers: readonly string[];

  /** Work item identifier (e.g. `DF-2704`). */
  taskId: string;
  /** Work item title / summary. */
  taskTitle: string;
  /** Current workflow status (e.g. `To Do`, `Defect Found`). */
  taskStatus: string;
  /** Work item type (e.g. `Task`, `Story`), or empty string if unavailable. */
  taskType: string;
  /** Work item priority (e.g. `High`), or empty string if unavailable. */
  taskPriority: string;
  /** Labels attached to the work item. */
  taskLabels: string[];
  /** Component names attached to the work item. */
  taskComponents: string[];
  /** Project key derived from the work item id (e.g. `DF`). */
  taskProject: string;
  /**
   * Plain-text work item description, normalized.
   *
   * **Contains untrusted content.** Use with care in templates —
   * prefer referencing the CLI prompt for full description rendering.
   * Useful for Liquid conditionals (e.g. `{% if taskDescription contains "migration" %}`).
   */
  taskDescription: string;
  /** ISO-8601 creation timestamp (e.g. `2026-01-15T10:30:00.000+0000`). */
  taskCreated: string;
  /** ISO-8601 last-updated timestamp, or empty string if unavailable. */
  taskUpdated: string;

  /** The comment trigger string that matched this variant (e.g. `@ralph write`). */
  commentTrigger: string;

  /**
   * Parsed trigger parameters from the comment callsign.
   *
   * Built from the raw comma-separated strings by {@link buildTriggerParams}.
   * Bare params (e.g. `codesamples`) map to `"true"`. Key-value params
   * (e.g. `branch_name=feature-xyz`) map to the value string.
   * Enables Liquid conditionals like `{% if triggerParams.codesamples %}`
   * and interpolation like `{{ triggerParams.branch_name }}`.
   */
  triggerParams: Record<string, string>;

  ralphchivesEnabled: boolean;

  /** Whether this task is a revision of a previous attempt. */
  isRevision: boolean;

  /** PR URL from a previous run, extracted from work item comments. Empty string if none found. */
  prUrl: string;

  /** Skill folder names deployed for this profile. */
  skills: readonly string[];

  /** Role identifier for the current pipeline stage (e.g. `primary`, `reviewer`). */
  stageRole: string;
  /** Execution mode for the current stage (`container` or `local`). */
  stageMode: string;
  /** 0-based index of the current stage. */
  stageIndex: number;
  /** Total number of stages in the pipeline. */
  stageCount: number;
  /** Whether this is the first stage in the pipeline. */
  isFirstStage: boolean;
  /** Whether this is the last stage in the pipeline. */
  isLastStage: boolean;
  /** Roles of previously completed stages (empty on the first stage). */
  previousStageRoles: string[];

  /**
   * Hook context — only populated for post-task hook stages.
   * All fields default to empty values for main pipeline stages.
   */
  hook: {
    /** Absolute path to the task's log directory. */
    taskOutputDir: string;
    /** Map of collected log file IDs to paths from the main pipeline. */
    collectedLogs: Record<string, string>;
    /** Name of the current hook. */
    name: string;
    /** Hook-specific output directory. */
    outputDir: string;
  };
}

/**
 * Build a {@link TemplateContext} from the already-parsed profile and work item.
 *
 * Called by {@link TaskRunner} before rendering so all data is available
 * as Liquid variables without re-reading `profile.json` from disk.
 */
export function buildTemplateContext(
  ctx: TaskContext,
  stageOverrides?: {
    stageIndex: number;
    stageCount: number;
    stageRole: string;
    stageMode: string;
    previousStageRoles: string[];
    /** Per-stage skill names — overrides profile-level skills for rendering and context. */
    skills?: readonly string[];
    /** Hook context — set only for post-task hook stages. */
    hook?: {
      collectedLogs: Record<string, string>;
      name: string;
      outputDir: string;
    };
  },
): TemplateContext {
  const resolvedParams = Array.isArray(ctx.triggerParams)
    ? buildTriggerParams(ctx.triggerParams)
    : ctx.triggerParams;

  return {
    profileId: ctx.profile.id,
    repo: ctx.profile.repoPath,
    targetRepoPath: ctx.profile.repoPath,
    cli: ctx.profile.cli,
    model: ctx.profile.model ?? "",
    agentName: ctx.profile.agentName,
    displayName: ctx.profile.displayName,
    mcpServers: ctx.profile.mcpServers,

    taskId: ctx.workItem.id,
    taskTitle: ctx.workItem.title,
    taskStatus: ctx.workItem.status,
    taskType: ctx.workItem.type,
    taskPriority: ctx.workItem.priority,
    taskLabels: [...ctx.workItem.labels],
    taskComponents: [...ctx.workItem.components],
    taskProject: ctx.workItem.project,
    taskDescription: ctx.workItem.description ? normalizeContent(ctx.workItem.description) : "",
    taskCreated: ctx.workItem.created,
    taskUpdated: ctx.workItem.updated,

    commentTrigger: ctx.profile.match.commentTrigger,
    triggerParams: resolvedParams,

    ralphchivesEnabled: ctx.ralphchivesEnabled,

    isRevision: ctx.isRevision,

    prUrl: ctx.prUrl ?? "",

    skills: stageOverrides?.skills ?? ctx.profile.skills,

    stageRole: stageOverrides?.stageRole ?? ctx.profile.stages[0]?.role ?? "primary",
    stageMode: stageOverrides?.stageMode ?? ctx.profile.stages[0]?.mode ?? "container",
    stageIndex: stageOverrides?.stageIndex ?? 0,
    stageCount: stageOverrides?.stageCount ?? ctx.profile.stages.length,
    isFirstStage: (stageOverrides?.stageIndex ?? 0) === 0,
    isLastStage: (stageOverrides?.stageIndex ?? 0) === (stageOverrides?.stageCount ?? ctx.profile.stages.length) - 1,
    previousStageRoles: stageOverrides?.previousStageRoles ?? [],

    hook: {
      taskOutputDir: stageOverrides?.hook ? ctx.outputDir : "",
      collectedLogs: stageOverrides?.hook?.collectedLogs ?? {},
      name: stageOverrides?.hook?.name ?? "",
      outputDir: stageOverrides?.hook?.outputDir ?? "",
    },
  };
}

/**
 * Build a key-value map from raw trigger params.
 *
 * Bare params like `"codesamples"` become `{ codesamples: "true" }`.
 * Key-value params like `"branch_name=feature-xyz"` become `{ branch_name: "feature-xyz" }`.
 */
export function buildTriggerParams(params: string[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const param of params) {
    const eqIndex = param.indexOf("=");
    if (eqIndex > 0) {
      map[param.slice(0, eqIndex).trim()] = param.slice(eqIndex + 1).trim();
    } else {
      map[param] = "true";
    }
  }
  return map;
}

/** Public contract for JIT agent template rendering. */
export interface IAgentTemplateRenderer {
  /** Render agent templates for a profile with the pre-built template context. */
  render(profileId: string, context: TemplateContext, logger?: Logger): Promise<void>;
}

/**
 * JIT agent template renderer.
 *
 * Accepts a pre-built {@link TemplateContext} and renders all agent
 * templates via Liquid. Called before each task so templates can use
 * runtime data like `{% if isRevision %}` or `{{ taskId }}`.
 */
export class AgentTemplateRenderer implements IAgentTemplateRenderer {
  constructor() {}

  async render(profileId: string, context: TemplateContext, logger?: Logger): Promise<void> {
    const root = process.cwd();
    const includesDir = resolve(root, "shared/agent-includes");

    if (!existsSync(includesDir)) {
      logger?.warn("Agent includes directory not found, skipping template rendering");
      return;
    }

    const profileDir = join(root, "profiles", profileId);
    const agentDir = join(profileDir, "agents");
    if (!existsSync(agentDir)) {
      logger?.warn(`No agents directory for profile ${profileId}, skipping template rendering`);
      return;
    }

    logger?.info(`Rendering agent templates for ${profileId}`);
    await resolveAgentIncludes(agentDir, includesDir, context, logger);
  }
}
