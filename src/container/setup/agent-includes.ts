import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Liquid } from "liquidjs";
import type { Logger } from "../../logger";
import { normalizeContent } from "../../prompt/normalizer";
import { registerCustomTags } from "./liquid-tags";
import type { TaskContext } from "../../services/task-context";
import type { CliType, IStageConfig } from "../../config/types";
import { AgentCatalog } from "../../cli/agent-catalog";
import type { AgentRenderTarget } from "../../cli/agent-file-writer";
import { agentFileWriterFor } from "../../cli/agent-writers";
import { cliToolNamesFor, type CliToolNames } from "../../cli/cli-tools";
import { syncDirectory } from "../../util/sync-dir";
import { agentsBuildDir, profileBuildPaths } from "./build-paths";
import { loadMcpManifest } from "./mcp-manifest";

/**
 * Template variables available to agent templates, shared partials and skills.
 *
 * Built from the parsed profile config, the current stage and the current work item, so templates
 * can tailor instructions per task (e.g. `{% if isRevision %}`, `{% if taskProject == "DOC" %}`).
 * Agent templates and the partials they render also see {@link AgentSelf} as `self`.
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
  /** CLI the current stage runs (`copilot` or `claude`). */
  cli: CliType;
  /** What the current stage's CLI calls the tools templates name in prose (`{{ cliTools.subagent }}`). */
  cliTools: CliToolNames;
  /** The current stage's model override, or empty string when the agent definition decides. */
  model: string;
  /** File id of the current stage's root agent (e.g. `ralph.ralph`). An agent's own name is `self.name`. */
  agentName: string;
  /** `agentName` without the `ralph.` prefix (e.g. `ralph`). */
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

  /** Path to the artifact directory for subagent output (e.g. `.ralph/tasks/DOC-123/artifacts`). */
  artifactDir: string;

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

/** The agent a template renders, exposed to it and to its partials as `self`. */
export interface AgentSelf {
  /** Frontmatter name (`malph-reviewer-opus`); names the agent's artifact directory and status files. */
  readonly name: string;
  /** Template file id (`ralph.malph-reviewer-opus`). */
  readonly fileId: string;
  /** Whether the agent is the current stage's root agent. */
  readonly isStageRoot: boolean;
  /** Names of the subagents the agent may spawn. */
  readonly subagents: readonly string[];
}

/** The pipeline or post-task hook stage a render is for, and where it sits in its pipeline. */
export type StageOverrides = {
  stage: IStageConfig;
  stageIndex: number;
  stageCount: number;
  previousStageRoles: string[];
  /** Hook context — set only for post-task hook stages. */
  hook?: {
    collectedLogs: Record<string, string>;
    name: string;
    outputDir: string;
  };
};

/**
 * Build a {@link TemplateContext} from the already-parsed profile and work item.
 *
 * Without `stageOverrides` the context describes the variant's first stage, with the union of all
 * its stages' skills, as rendered before the container starts.
 */
export function buildTemplateContext(ctx: TaskContext, stageOverrides?: StageOverrides): TemplateContext {
  const resolvedParams = Array.isArray(ctx.triggerParams) ? buildTriggerParams(ctx.triggerParams) : ctx.triggerParams;
  const stage = stageOverrides?.stage ?? ctx.profile.stages[0];
  const stageIndex = stageOverrides?.stageIndex ?? 0;
  const stageCount = stageOverrides?.stageCount ?? ctx.profile.stages.length;

  return {
    profileId: ctx.profile.id,
    repo: ctx.profile.repoPath,
    targetRepoPath: ctx.profile.repoPath,
    cli: stage.cli,
    cliTools: cliToolNamesFor(stage.cli),
    model: stage.model ?? ctx.profile.model ?? "",
    agentName: stage.agent,
    displayName: stage.agent.replace(/^ralph\./, ""),
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

    skills: stageOverrides ? stage.skills : ctx.profile.skills,

    artifactDir: `.ralph/tasks/${ctx.workItem.id}/artifacts`,

    stageRole: stage.role,
    stageMode: stage.mode,
    stageIndex,
    stageCount,
    isFirstStage: stageIndex === 0,
    isLastStage: stageIndex === stageCount - 1,
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

/**
 * A Liquid engine resolving `{% render %}` partials from `roots` (`.md` implied), with Ralph's
 * custom tags registered.
 */
export function createTemplateEngine(roots: readonly string[]): Liquid {
  const engine = new Liquid({ root: [...roots], extname: ".md" });
  registerCustomTags(engine);
  return engine;
}

/**
 * The render target of `stage`: its CLI, its root agent and the profile's build directory for that CLI
 * under the orchestrator's working directory.
 */
export function stageRenderTarget(profileId: string, stage: IStageConfig): AgentRenderTarget {
  const outDir = agentsBuildDir(profileBuildPaths(process.cwd(), profileId), stage.cli);
  return { cli: stage.cli, rootAgentFileId: stage.agent, outDir };
}

/**
 * The allowlisted tools of each server in `serverNames`, read from its manifest; an empty list
 * means the server allows every tool.
 *
 * @throws Error when a server's manifest is missing or malformed.
 */
export function resolveMcpToolNames(mcpServersDir: string, serverNames: readonly string[]): Record<string, string[]> {
  return Object.fromEntries(serverNames.map((name) => [name, loadMcpManifest(mcpServersDir, name).tools ?? []]));
}

/** Inputs of {@link renderAgents}. */
export interface RenderAgentsInput {
  /** The profile's `agents/` directory of canonical templates. */
  readonly agentsDir: string;
  /** Root of the shared partials (`shared/agent-includes`). */
  readonly includesDir: string;
  readonly context: TemplateContext;
  readonly target: AgentRenderTarget;
  /** Allowlisted tools of each MCP server the variant runs (see {@link resolveMcpToolNames}). */
  readonly mcpTools: Readonly<Record<string, readonly string[]>>;
  readonly logger?: Logger;
}

/**
 * Renders the agents a stage can reach into `target.outDir` in the target CLI's agent file format.
 *
 * Each agent's Liquid body is rendered with `context` plus its own {@link AgentSelf} as `self`, then
 * serialised by the CLI's agent file writer. The output is staged and synced, so `outDir` keeps its
 * inode and unreachable agents from an earlier render are removed.
 *
 * @returns The file names written, root agent first.
 * @throws AgentDefinitionError or Error when a template is invalid, the agent set is not a valid
 *   graph, the root agent does not exist, a Liquid template fails, or a reachable agent does not
 *   run on `target.cli`.
 */
export async function renderAgents(input: RenderAgentsInput): Promise<string[]> {
  const { agentsDir, includesDir, context, target, mcpTools, logger } = input;
  const catalog = await AgentCatalog.load(agentsDir);
  const reachable = catalog.reachableFrom(target.rootAgentFileId);
  const stageSubagents = reachable.slice(1).map((fileId) => catalog.get(fileId).frontmatter.name);
  const writer = agentFileWriterFor(target.cli);
  const engine = createTemplateEngine([includesDir]);

  const staging = await mkdtemp(join(tmpdir(), "ralph-agents-"));
  try {
    const written: string[] = [];
    for (const fileId of reachable) {
      const { frontmatter, bodyTemplate } = catalog.get(fileId);
      const isStageRoot = fileId === target.rootAgentFileId;
      const self: AgentSelf = { name: frontmatter.name, fileId, isStageRoot, subagents: frontmatter.subagents };
      const scope = { ...context, self };
      const body = await engine.parseAndRender(bodyTemplate, scope, { globals: scope });

      const file = writer.write({ ...frontmatter, fileId, body }, { isStageRoot, stageSubagents, mcpTools });
      if (!file) {
        throw new Error(
          `Agent ${fileId} is reachable from ${target.rootAgentFileId} but its runtimes ` +
            `[${frontmatter.runtimes.join(", ")}] exclude cli "${target.cli}"`,
        );
      }
      await writeFile(join(staging, file.fileName), file.content, "utf-8");
      written.push(file.fileName);
      logger?.info(`  → ${file.fileName}: rendered for ${target.cli}`);
    }
    await syncDirectory(staging, target.outDir);
    return written;
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}

/** Public contract for JIT agent template rendering. */
export interface IAgentTemplateRenderer {
  /**
   * Render the agents of `target`'s stage for `target.cli` into `target.outDir`.
   *
   * @throws Error when rendering fails (see {@link renderAgents}).
   */
  render(profileId: string, context: TemplateContext, target: AgentRenderTarget, logger?: Logger): Promise<void>;
}

/**
 * JIT agent template renderer.
 *
 * Reads the profile's canonical templates from `profiles/<id>/agents/`, partials from
 * `shared/agent-includes/` and MCP tool allowlists from `shared/mcp-servers/`, all under the
 * orchestrator root. Called before each task and stage so templates can use runtime data like
 * `{% if isRevision %}` or `{{ taskId }}`.
 */
export class AgentTemplateRenderer implements IAgentTemplateRenderer {
  constructor() {}

  async render(profileId: string, context: TemplateContext, target: AgentRenderTarget, logger?: Logger): Promise<void> {
    const root = process.cwd();
    const includesDir = resolve(root, "shared/agent-includes");
    const agentsDir = join(root, "profiles", profileId, "agents");

    if (!existsSync(includesDir)) {
      logger?.warn("Agent includes directory not found, skipping template rendering");
      return;
    }
    if (!existsSync(agentsDir)) {
      logger?.warn(`No agents directory for profile ${profileId}, skipping template rendering`);
      return;
    }

    logger?.info(`Rendering agents of ${profileId} reachable from ${target.rootAgentFileId} for ${target.cli}`);
    const mcpTools = resolveMcpToolNames(resolve(root, "shared/mcp-servers"), context.mcpServers);
    await renderAgents({ agentsDir, includesDir, context, target, mcpTools, logger });
  }
}
