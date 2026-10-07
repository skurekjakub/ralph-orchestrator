import { CliType } from "../../config/types";
import { yamlScalar, yamlSingleQuoted } from "../../util/frontmatter";
import type { AgentDefinition, AgentFile, AgentWriteContext, IAgentFileWriter } from "../agent-file-writer";
import { CLAUDE_BUILTIN_TOOLS, CLAUDE_SUBAGENT_TOOL, claudeMcpToolName } from "./claude-tools";

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
 * Writes Claude Code agent files (`<name>.md` under `$CLAUDE_CONFIG_DIR/agents/`). Canonical keys
 * map one to one, except that `subagents` becomes the `Agent(…)` grant inside `tools` and the
 * Copilot-only `copilot` block is dropped.
 */
export class ClaudeAgentWriter implements IAgentFileWriter {
  write(agent: AgentDefinition, context: AgentWriteContext): AgentFile | null {
    if (!agent.runtimes.includes(CliType.Claude)) return null;

    const lines = [`name: ${agent.name}`, `description: ${yamlSingleQuoted(agent.description)}`];
    if (agent.model !== undefined) lines.push(`model: ${yamlScalar(agent.model)}`);
    lines.push(`tools: ${toolsValue(agent, context)}`);
    if (agent.skills.length > 0) {
      lines.push("skills:", ...agent.skills.map((skill) => `  - ${yamlScalar(skill)}`));
    }
    if (agent.effort !== undefined) lines.push(`effort: ${agent.effort}`);
    if (agent.maxTurns !== undefined) lines.push(`maxTurns: ${agent.maxTurns}`);

    return {
      fileName: claudeAgentFileName(agent.name),
      content: `---\n${lines.join("\n")}\n---\n${agent.body}`,
    };
  }
}
