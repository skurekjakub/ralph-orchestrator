import type { CliType } from "../config/types";
import type { AgentFrontmatter } from "./agent-definition";

/** One agent of a profile in its canonical, CLI-neutral form, with its Liquid body already rendered. */
export interface AgentDefinition extends AgentFrontmatter {
  /** Agent file name without `.agent.md` (e.g. `ralph.ralph`); stages reference agents by it. */
  readonly fileId: string;
  /** Rendered markdown body: the agent's system prompt. */
  readonly body: string;
}

/** The stage an agent file is written for. */
export interface AgentWriteContext {
  /** True for the stage's root agent (`stages[].agent`). */
  readonly isStageRoot: boolean;
  /** Names of every agent reachable from the stage root, root excluded, root's own subagents first. */
  readonly stageSubagents: readonly string[];
  /**
   * Allowlisted tool names of each MCP server the stage's variant runs, keyed by server name. An
   * empty list means the server allows every tool it exposes.
   */
  readonly mcpTools: Readonly<Record<string, readonly string[]>>;
}

/** One agent serialised for one CLI. */
export interface AgentFile {
  /** File name inside the render target's output directory. */
  readonly fileName: string;
  /** Frontmatter followed by the body. */
  readonly content: string;
}

/** Serialises canonical agent definitions into one CLI's agent file format. */
export interface IAgentFileWriter {
  /**
   * Serialise `agent` for this writer's CLI.
   *
   * @returns The agent file, or null when the agent's `runtimes` exclude this CLI.
   */
  write(agent: AgentDefinition, context: AgentWriteContext): AgentFile | null;
  /**
   * The model this writer's CLI runs `agent` on, as its agent file names it.
   *
   * @returns Undefined when the agent names no model or inherits its parent's, so the CLI or the parent decides.
   */
  modelOf(agent: AgentFrontmatter): string | undefined;
}

/** Subagent edges between one profile's agents, keyed by agent file id. */
export interface AgentGraph {
  /**
   * File ids of `rootFileId` and of every agent reachable from it through `subagents`, root first,
   * then breadth-first.
   *
   * @throws Error when the profile has no agent `rootFileId`.
   */
  reachableFrom(rootFileId: string): readonly string[];
  /**
   * Length of the longest subagent chain below `rootFileId`; 0 for an agent without subagents.
   *
   * @throws Error when the profile has no agent `rootFileId`.
   */
  depthFrom(rootFileId: string): number;
}

/** Where, and for which CLI, one stage's agents are rendered. */
export interface AgentRenderTarget {
  /** CLI the stage runs; selects the agent file writer. */
  readonly cli: CliType;
  /** File id of the stage's root agent (`stages[].agent`); only agents reachable from it are rendered. */
  readonly rootAgentFileId: string;
  /** Host directory that receives the rendered agent files; synced in place, its own inode kept. */
  readonly outDir: string;
  /** Whether files in `outDir` that this render does not write are removed. */
  readonly prune: boolean;
}
