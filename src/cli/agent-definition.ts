import { z } from "zod";
import { CliType, ReasoningEffort } from "../config/types";
import { FrontmatterError, parseFrontmatter, splitFrontmatter } from "../util/frontmatter";
import { ClaudeBuiltinTool } from "./claude/claude-tools";
import { CLAUDE_MODEL_POLICY, COPILOT_MODEL_POLICY } from "./model-catalog";

/** Suffix of agent template files in `profiles/<id>/agents/`; the file id is the name without it. */
export const AGENT_SOURCE_SUFFIX = ".agent.md";

/** Agent names: lowercase words joined by hyphens (`ralph-reviewer-ia`). */
export const AGENT_NAME_PATTERN = /^[a-z][a-z0-9-]*$/;

/** Canonical model value for a subagent that runs its parent's model. */
export const INHERIT_MODEL = "inherit";

/** Copilot CLI agent-format keys the canonical frontmatter rejects, with the fix each error suggests. */
const COPILOT_FORMAT_KEY_HINTS: Readonly<Record<string, string>> = {
  agents: "rename it to `subagents`",
  "user-invocable": "remove it; the Copilot writer always emits `user-invocable: false`",
};

const agentName = z.string().regex(AGENT_NAME_PATTERN, "must be lowercase words joined by hyphens");

/** A list without repeated entries. */
function uniqueList<T extends z.ZodType>(item: T) {
  return z.array(item).refine((items) => new Set(items).size === items.length, "must not repeat an entry");
}

/** A canonical model: a Claude Code alias or full id, or `inherit`. */
const canonicalModel = z.string().superRefine((model, ctx) => {
  if (model === INHERIT_MODEL) return;
  const reason = CLAUDE_MODEL_POLICY.validate(model);
  if (reason) ctx.addIssue({ code: "custom", message: reason });
});

/** A Copilot CLI model id. */
const copilotModel = z.string().superRefine((model, ctx) => {
  const reason = COPILOT_MODEL_POLICY.validate(model);
  if (reason) ctx.addIssue({ code: "custom", message: reason });
});

/**
 * Canonical agent frontmatter: one CLI-neutral source per agent, translated to each CLI's agent file
 * format at render time. Unknown keys, including the Copilot-only `agents` and `user-invocable`, are
 * rejected.
 */
export const agentFrontmatterSchema = z.strictObject({
  /** Name the CLI resolves the agent by; unique within the profile. */
  name: agentName,
  description: z.string().min(1, "must not be empty"),
  /** Claude Code alias (`opus`) or full id, or `inherit` for a subagent that runs its parent's model. */
  model: canonicalModel.optional(),
  /** Names of the agents this agent may spawn; each must be an agent of the same profile. */
  subagents: uniqueList(agentName).default([]),
  /** Claude Code built-in tools the agent may use; omitted means every tool Ralph grants. */
  tools: uniqueList(z.enum(ClaudeBuiltinTool)).optional(),
  /**
   * Skills the agent starts with on Claude Code: preloaded into its context as a subagent, loaded with the `Skill`
   * tool as its first step as a stage root, whose `tools` must then include `Skill`. Each must be one of its
   * stage's skills.
   */
  skills: uniqueList(z.string().min(1)).default([]),
  /** Claude Code reasoning effort for the agent. */
  effort: z.enum(ReasoningEffort).optional(),
  /** Claude Code turn cap for one run of the agent. */
  maxTurns: z.number().int().positive().optional(),
  /** CLIs the agent can run on. */
  runtimes: uniqueList(z.enum(CliType)).min(1, "must name at least one CLI").default([CliType.Claude, CliType.Copilot]),
  /** Copilot-only overrides. */
  copilot: z
    .strictObject({
      /** Copilot model id used instead of the mapping of `model`. */
      model: copilotModel.optional(),
    })
    .default({}),
});

/** Parsed and defaulted canonical frontmatter. */
export type AgentFrontmatter = z.output<typeof agentFrontmatterSchema>;

/** One agent template: its identity, canonical frontmatter and the Liquid body still to render. */
export interface AgentSource {
  /** File name without `.agent.md` (`ralph.ralph`); stages reference agents by it. */
  readonly fileId: string;
  readonly frontmatter: AgentFrontmatter;
  /** Liquid template of the agent's system prompt: everything after the closing `---` line. */
  readonly bodyTemplate: string;
}

/** Thrown when an agent template's frontmatter is missing, malformed or breaks the canonical schema. */
export class AgentDefinitionError extends Error {
  constructor(
    readonly fileId: string,
    readonly problems: readonly string[],
  ) {
    super(`agent ${fileId}${AGENT_SOURCE_SUFFIX}: ${problems.join("; ")}`);
    this.name = "AgentDefinitionError";
  }
}

/** The file id of an agent template file name (`ralph.ralph.agent.md` → `ralph.ralph`), or null for other files. */
export function agentFileIdOf(fileName: string): string | null {
  return fileName.endsWith(AGENT_SOURCE_SUFFIX) ? fileName.slice(0, -AGENT_SOURCE_SUFFIX.length) : null;
}

/**
 * Parses one agent template.
 *
 * @param fileId The template's file id (`ralph.ralph`).
 * @param source The template file's content.
 * @throws AgentDefinitionError listing every problem with the frontmatter.
 */
export function parseAgentSource(fileId: string, source: string): AgentSource {
  let raw: Record<string, unknown>;
  let bodyTemplate: string;
  try {
    const document = splitFrontmatter(source);
    raw = parseFrontmatter(document.frontmatter);
    bodyTemplate = document.body;
  } catch (err) {
    if (err instanceof FrontmatterError) throw new AgentDefinitionError(fileId, [err.message]);
    throw err;
  }

  const parsed = agentFrontmatterSchema.safeParse(raw);
  if (!parsed.success) {
    throw new AgentDefinitionError(fileId, parsed.error.issues.flatMap(describeIssue));
  }
  return { fileId, frontmatter: parsed.data, bodyTemplate };
}

/** Human-readable problems for one schema issue, with the replacement for each legacy Copilot key. */
function describeIssue(issue: z.core.$ZodIssue): string[] {
  if (issue.code === "unrecognized_keys") {
    return issue.keys.map((key) => {
      const hint = COPILOT_FORMAT_KEY_HINTS[key];
      return hint ? `unknown key "${key}": ${hint}` : `unknown key "${key}"`;
    });
  }
  const path = issue.path.map(String).join(".");
  return [path === "" ? issue.message : `${path}: ${issue.message}`];
}
