import { existsSync } from "node:fs";
import { AgentCatalog, findAgentCatalogIssues, scanAgentSources } from "../cli/agent-catalog";
import { AGENT_SOURCE_SUFFIX, INHERIT_MODEL } from "../cli/agent-definition";
import { ClaudeBuiltinTool } from "../cli/claude/claude-tools";
import { COPILOT_MODEL_POLICY } from "../cli/model-catalog";
import { CliType, type IAgentProfile } from "../config/types";
import { toErrorMessage } from "../util/error";
import { locateStages, type LocatedStage } from "./stages";

/** Every problem with one stage's agent graph on the stage's CLI. */
function stageGraphProblems(catalog: AgentCatalog, { stage }: LocatedStage): string[] {
  const problems: string[] = [];
  const root = catalog.get(stage.agent);
  if (root.frontmatter.model === INHERIT_MODEL) {
    problems.push(`agent ${stage.agent} runs as the stage root, so its model cannot be "${INHERIT_MODEL}"`);
  }
  const { skills, tools } = root.frontmatter;
  if (stage.cli === CliType.Claude && skills.length > 0 && tools && !tools.includes(ClaudeBuiltinTool.Skill)) {
    problems.push(
      `agent ${stage.agent} runs as the stage root on cli "claude", which loads its skills with the ` +
        `${ClaudeBuiltinTool.Skill} tool, so its tools must include ${ClaudeBuiltinTool.Skill}`,
    );
  }

  for (const fileId of catalog.reachableFrom(stage.agent)) {
    const { frontmatter } = catalog.get(fileId);
    const where = fileId === stage.agent ? `agent ${fileId}` : `agent ${fileId} (reachable from ${stage.agent})`;

    if (!frontmatter.runtimes.includes(stage.cli)) {
      problems.push(
        `${where} does not run on cli "${stage.cli}" (runtimes: ${frontmatter.runtimes.join(", ")})\n` +
          `  Add "${stage.cli}" to its runtimes or run the stage on another cli`,
      );
      continue;
    }

    const missingSkills = frontmatter.skills.filter((skill) => !stage.skills.includes(skill));
    if (missingSkills.length > 0) {
      problems.push(`${where} preloads skill(s) the stage does not mount: ${missingSkills.join(", ")}`);
    }

    if (stage.cli === CliType.Copilot && frontmatter.copilot.model === undefined) {
      const { model } = frontmatter;
      if (model !== undefined && model !== INHERIT_MODEL) {
        try {
          COPILOT_MODEL_POLICY.fromCanonical(model);
        } catch (err) {
          problems.push(`${where}: ${toErrorMessage(err)}`);
        }
      }
    }
  }
  return problems;
}

/**
 * Validate one profile's agent templates and the agent graph each of its stages runs.
 *
 * Checks that every `*.agent.md` has valid canonical frontmatter, that names are unique, that every
 * `subagents` entry is an agent of the profile and that there are no subagent cycles. For each
 * variant and post-task hook stage: its root agent exists and does not `inherit` a model, on Claude Code
 * a root that lists skills keeps the `Skill` tool, every
 * agent it can reach runs on the stage's CLI and preloads only skills the stage mounts, and on
 * Copilot every reachable model has a Copilot equivalent. A finding shared by several stages is
 * reported once.
 *
 * @param variants The profile's variants as `resolveProfileVariants` expands them.
 * @param agentsDir The profile's `agents/` directory.
 * @param prefix Location prefix for messages (`profiles/<id>`).
 */
export async function validateAgentGraph(
  variants: readonly IAgentProfile[],
  agentsDir: string,
  prefix: string,
  errors: string[],
): Promise<void> {
  if (!existsSync(agentsDir)) {
    errors.push(
      `${prefix}: agents/ directory not found\n  Create ${prefix}/agents/ with the profile's agent templates`,
    );
    return;
  }

  const { fileIds, sources, errors: templateErrors } = await scanAgentSources(agentsDir);
  for (const { fileId, problems } of templateErrors) {
    errors.push(...problems.map((problem) => `${prefix}/agents/${fileId}${AGENT_SOURCE_SUFFIX}: ${problem}`));
  }

  const allParsed = templateErrors.length === 0;
  const graphIssues = allParsed ? findAgentCatalogIssues(sources) : [];
  errors.push(...graphIssues.map((issue) => `${prefix}/agents: ${issue}`));
  const catalog = allParsed && graphIssues.length === 0 ? new AgentCatalog(sources) : undefined;

  const findings = new Set<string>();
  for (const located of locateStages(variants)) {
    const { stage, path } = located;
    if (!fileIds.includes(stage.agent)) {
      errors.push(
        `${prefix}/${path}: agent "${stage.agent}" not found in ${prefix}/agents/\n` +
          `  Available agents: ${fileIds.join(", ")}\n` +
          `  Agent files use the pattern: <name>${AGENT_SOURCE_SUFFIX}`,
      );
      continue;
    }
    if (!catalog) continue;
    for (const problem of stageGraphProblems(catalog, located)) findings.add(`${prefix}: ${problem}`);
  }
  errors.push(...findings);
}
