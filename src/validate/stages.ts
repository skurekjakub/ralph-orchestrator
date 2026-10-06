import { modelPolicyFor } from "../cli/model-catalog.js";
import type { ProfileFile } from "../config/schemas.js";
import { CliType, type IAgentProfile, type IStageConfig } from "../config/types.js";

/** A resolved stage with its location in profile.json (`variants[0]/postTaskHooks[1]/stages[2]`). */
interface LocatedStage {
  readonly stage: IStageConfig;
  readonly variantIndex: number;
  readonly path: string;
}

/** Where a stage's effective model is declared: the stage, its variant, or the profile (`path` ""). */
interface ModelSource {
  readonly model: string;
  readonly path: string;
}

/** Claude Code options that a stage running another CLI must not set. */
const CLAUDE_ONLY_STAGE_OPTIONS = ["effort", "maxBudgetUsd"] as const;

/** Every variant and post-task hook stage of `variants`, in profile.json order. */
function locateStages(variants: readonly IAgentProfile[]): LocatedStage[] {
  return variants.flatMap((variant, variantIndex) => [
    ...variant.stages.map((stage, si) => ({ stage, variantIndex, path: `variants[${variantIndex}]/stages[${si}]` })),
    ...variant.postTaskHooks.flatMap((hook, hi) =>
      hook.stages.map((stage, si) => ({
        stage,
        variantIndex,
        path: `variants[${variantIndex}]/postTaskHooks[${hi}]/stages[${si}]`,
      })),
    ),
  ]);
}

/** The model a stage runs and where it is declared, or undefined when nothing sets one. */
function modelSourceOf(parsed: ProfileFile, { stage, variantIndex, path }: LocatedStage): ModelSource | undefined {
  if (stage.model !== undefined) return { model: stage.model, path };
  const variantModel = parsed.variants[variantIndex].model;
  if (variantModel !== undefined) return { model: variantModel, path: `variants[${variantIndex}]` };
  if (parsed.model !== undefined) return { model: parsed.model, path: "" };
  return undefined;
}

/** `prefix` extended with a profile.json location, or `prefix` alone for the profile itself. */
function locate(prefix: string, path: string): string {
  return path === "" ? prefix : `${prefix}/${path}`;
}

/**
 * Validate what each stage's resolved CLI implies for one profile: the CLI can run, the stage sets
 * only options that CLI supports, and the stage's model is one that CLI accepts.
 *
 * A model error is reported once, where the model is declared. A stage that switches to another
 * CLI than the profile's must set its own model rather than inherit one chosen for the profile CLI.
 *
 * @param parsed The schema-parsed profile.json, for where each model is declared.
 * @param variants `parsed` expanded by `resolveProfileVariants`, in variant order.
 * @param prefix Location prefix for messages (`profiles/<id>`).
 */
export function validateStageClis(
  parsed: ProfileFile,
  variants: readonly IAgentProfile[],
  prefix: string,
  errors: string[],
): void {
  const stages = locateStages(variants);

  const claudeStages = stages.filter(({ stage }) => stage.cli === CliType.Claude);
  if (claudeStages.length > 0) {
    errors.push(
      `${prefix}: cli "claude" is not supported yet — the Claude Code runtime is not wired into stage execution. ` +
        `Use cli "copilot".\n  Stages running claude: ${claudeStages.map((s) => s.path).join(", ")}`,
    );
  }

  for (const { stage, path } of stages) {
    if (stage.cli === CliType.Claude) continue;
    for (const option of CLAUDE_ONLY_STAGE_OPTIONS) {
      if (stage[option] !== undefined) {
        errors.push(`${prefix}/${path}: ${option} is a Claude Code option, but this stage runs cli "${stage.cli}"`);
      }
    }
  }

  if (parsed.githubMcpTools !== false && !stages.some(({ stage }) => stage.cli === CliType.Copilot)) {
    errors.push(
      `${prefix}: githubMcpTools only affects Copilot stages, but no stage runs cli "copilot"\n` +
        `  Remove githubMcpTools or set it to false`,
    );
  }

  const modelErrors = new Set<string>();
  for (const located of stages) {
    const source = modelSourceOf(parsed, located);
    if (!source) continue;
    const { stage, path } = located;
    if (source.path !== path && stage.cli !== parsed.cli) {
      modelErrors.add(
        `${prefix}/${path}: runs cli "${stage.cli}" but inherits model "${source.model}" chosen for cli ` +
          `"${parsed.cli}" at ${locate(prefix, source.path)}\n  Set model on this stage`,
      );
      continue;
    }
    const reason = modelPolicyFor(stage.cli).validate(source.model);
    if (reason) modelErrors.add(`${locate(prefix, source.path)}: ${reason}`);
  }
  errors.push(...modelErrors);
}
