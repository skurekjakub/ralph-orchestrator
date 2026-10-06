import type { CliType, ReasoningEffort } from "../config/types";

/** One agent of a profile in its canonical, CLI-neutral form, with its Liquid body already rendered. */
export interface AgentDefinition {
  /** Agent file name without `.agent.md` (e.g. `ralph.ralph`); stages reference agents by it. */
  readonly fileId: string;
  /** Frontmatter `name` the CLI resolves the agent by (e.g. `ralph`). */
  readonly name: string;
  readonly description: string;
  /** A Claude Code alias or full id, or `inherit` for a subagent that runs its parent's model. */
  readonly model?: string;
  /** Frontmatter names of the subagents this agent may spawn. */
  readonly subagents: readonly string[];
  /** Built-in tools the agent may use; undefined means the runtime's default set. */
  readonly tools?: readonly string[];
  /** Skills Claude Code preloads into the agent's context. */
  readonly skills: readonly string[];
  readonly effort?: ReasoningEffort;
  /** Turn cap for one run of the agent. */
  readonly maxTurns?: number;
  /** CLIs the agent can be rendered for. */
  readonly runtimes: readonly CliType[];
  /** Copilot-only overrides. */
  readonly copilot: { readonly model?: string };
  /** Rendered markdown body: the agent's system prompt. */
  readonly body: string;
}

/** The stage an agent file is written for. */
export interface AgentWriteContext {
  /** True for the stage's root agent (`stages[].agent`). */
  readonly isStageRoot: boolean;
  /** Frontmatter names of every agent reachable from the stage root, root excluded. */
  readonly stageSubagents: readonly string[];
  /** Tool names of each MCP server the stage's variant runs, keyed by server name. */
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
}

/** Subagent edges between one profile's agents, keyed by agent file id. */
export interface AgentGraph {
  /** File ids of `rootFileId` and of every agent reachable from it through `subagents`, root first. */
  reachableFrom(rootFileId: string): readonly string[];
  /** Length of the longest subagent chain below `rootFileId`; 0 for an agent without subagents. */
  depthFrom(rootFileId: string): number;
}

/** Where, and for which CLI, one stage's agents are rendered. */
export interface AgentRenderTarget {
  /** CLI the stage runs; selects the agent file writer. */
  readonly cli: CliType;
  /** File id of the stage's root agent (`stages[].agent`). */
  readonly rootAgentFileId: string;
  /** Host directory that receives the rendered agent files. */
  readonly outDir: string;
  /** The profile's agent graph; only agents reachable from the root are rendered. */
  readonly agentGraph: AgentGraph;
}
