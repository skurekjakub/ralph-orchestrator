import { CliType } from "../../config/types";
import { yamlSingleQuoted } from "../../util/frontmatter";
import { AGENT_SOURCE_SUFFIX, INHERIT_MODEL } from "../agent-definition";
import type { AgentDefinition, AgentFile, IAgentFileWriter } from "../agent-file-writer";
import { COPILOT_MODEL_POLICY } from "../model-catalog";

/** File name Copilot CLI discovers an agent under: its template file name (`ralph.ralph.agent.md`). */
export function copilotAgentFileName(fileId: string): string {
  return `${fileId}${AGENT_SOURCE_SUFFIX}`;
}

/**
 * The Copilot model of `agent`: its `copilot.model`, else the Copilot equivalent of its canonical
 * model. Undefined leaves the choice to Copilot CLI, which is also what `inherit` maps to.
 */
function copilotModelOf(agent: AgentDefinition): string | undefined {
  if (agent.copilot.model !== undefined) return agent.copilot.model;
  if (agent.model === undefined || agent.model === INHERIT_MODEL) return undefined;
  return COPILOT_MODEL_POLICY.fromCanonical(agent.model);
}

/**
 * Writes Copilot CLI agent files (`<fileId>.agent.md` under `.github/agents/`). `subagents` becomes
 * `agents`, the model is translated to a Copilot id, every agent is `user-invocable: false`, and
 * the Claude Code-only keys (`tools`, `skills`, `effort`, `maxTurns`) are dropped.
 */
export class CopilotAgentWriter implements IAgentFileWriter {
  write(agent: AgentDefinition): AgentFile | null {
    if (!agent.runtimes.includes(CliType.Copilot)) return null;

    const lines = [`description: ${yamlSingleQuoted(agent.description)}`];
    const model = copilotModelOf(agent);
    if (model !== undefined) lines.push(`model: ${model}`);
    lines.push(`name: ${yamlSingleQuoted(agent.name)}`, "user-invocable: false");
    if (agent.subagents.length > 0) {
      lines.push(`agents: [${agent.subagents.map(yamlSingleQuoted).join(", ")}]`);
    }

    return {
      fileName: copilotAgentFileName(agent.fileId),
      content: `---\n${lines.join("\n")}\n---\n${agent.body}`,
    };
  }
}
