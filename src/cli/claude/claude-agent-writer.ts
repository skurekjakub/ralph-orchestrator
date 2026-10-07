import { CliType } from "../../config/types";
import { type AgentFrontmatter, INHERIT_MODEL } from "../agent-definition";
import { yamlScalar, yamlSingleQuoted } from "../../util/frontmatter";
import type { AgentDefinition, AgentFile, AgentWriteContext, IAgentFileWriter } from "../agent-file-writer";
import { CLAUDE_BUILTIN_TOOLS, CLAUDE_SUBAGENT_TOOL, ClaudeBuiltinTool, claudeMcpToolName } from "./claude-tools";

/** File name Claude Code discovers an agent under: its frontmatter name (`ralph.md`). */
export function claudeAgentFileName(name: string): string {
  return `${name}.md`;
}

/**
 * The agents an agent's `Agent(…)` grant names. Claude Code checks a nested spawn against the stage
 * root's grant, not the spawning subagent's, so the root lists every agent reachable in the stage
 * and a subagent lists its own subagents only to document intent. A leaf gets no grant, which also
 * stops it respawning itself.
 */
function spawnableAgents(agent: AgentDefinition, context: AgentWriteContext): readonly string[] {
  return context.isStageRoot ? context.stageSubagents : agent.subagents;
}

/**
 * The comma-separated `tools` value: the `Agent(…)` grant, the built-in tools (the agent's own list
 * or every tool Ralph grants) and every allowlisted tool of the variant's MCP servers.
 */
function toolsValue(agent: AgentDefinition, context: AgentWriteContext): string {
  const spawnable = spawnableAgents(agent, context);
  const mcpTools = Object.entries(context.mcpTools).flatMap(([server, tools]) =>
    tools.length === 0 ? [claudeMcpToolName(server)] : tools.map((tool) => claudeMcpToolName(server, tool)),
  );
  return [
    ...(spawnable.length > 0 ? [`${CLAUDE_SUBAGENT_TOOL}(${spawnable.join(", ")})`] : []),
    ...(agent.tools ?? CLAUDE_BUILTIN_TOOLS),
    ...mcpTools,
  ].join(", ");
}

/**
 * The instruction a stage root's body starts with when the root lists `skills`: load each of them with the
 * `Skill` tool before anything else.
 */
function stageRootSkillsInstruction(skills: readonly string[]): string {
  const names = skills.map((skill) => `\`${skill}\``).join(", ");
  return (
    "<startup-skills>\n" +
    `Before you do anything else, load each of these skills with the ${ClaudeBuiltinTool.Skill} tool, one call per ` +
    `skill: ${names}. Their instructions are part of yours.\n` +
    "</startup-skills>\n"
  );
}

/**
 * Writes Claude Code agent files (`<name>.md` under `$CLAUDE_CONFIG_DIR/agents/`). Canonical keys
 * map one to one, except that `subagents` becomes the `Agent(…)` grant inside `tools` and the
 * Copilot-only `copilot` block is dropped.
 *
 * Claude Code preloads frontmatter `skills` only into an agent it spawns as a subagent, not into the
 * `--agent` session root. A subagent's skills therefore stay in its frontmatter, and a stage root's
 * become {@link stageRootSkillsInstruction} at the top of its body.
 */
export class ClaudeAgentWriter implements IAgentFileWriter {
  write(agent: AgentDefinition, context: AgentWriteContext): AgentFile | null {
    if (!agent.runtimes.includes(CliType.Claude)) return null;

    const lines = [`name: ${agent.name}`, `description: ${yamlSingleQuoted(agent.description)}`];
    if (agent.model !== undefined) lines.push(`model: ${yamlScalar(agent.model)}`);
    lines.push(`tools: ${toolsValue(agent, context)}`);
    const rootSkills = context.isStageRoot && agent.skills.length > 0;
    if (agent.skills.length > 0 && !rootSkills) {
      lines.push("skills:", ...agent.skills.map((skill) => `  - ${yamlScalar(skill)}`));
    }
    if (agent.effort !== undefined) lines.push(`effort: ${agent.effort}`);
    if (agent.maxTurns !== undefined) lines.push(`maxTurns: ${agent.maxTurns}`);

    const body = rootSkills ? `${stageRootSkillsInstruction(agent.skills)}${agent.body}` : agent.body;
    return {
      fileName: claudeAgentFileName(agent.name),
      content: `---\n${lines.join("\n")}\n---\n${body}`,
    };
  }

  /** The agent's canonical model; undefined when it names none or inherits its parent's. */
  modelOf(agent: AgentFrontmatter): string | undefined {
    return agent.model === INHERIT_MODEL ? undefined : agent.model;
  }
}
