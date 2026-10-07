import { modelPolicyFor } from "../cli/model-catalog";
import type { ProfileFile } from "../config/schemas";
import { CliType, StageMode, type IAgentProfile, type IStageConfig } from "../config/types";
import { isSafeName } from "../util/safe-id";

/** A resolved stage with its location in profile.json (`variants[0]/postTaskHooks[1]/stages[2]`). */
export interface LocatedStage {
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
const CLAUDE_ONLY_STAGE_OPTIONS = ["effort"] as const;

/** Every variant and post-task hook stage of `variants`, in profile.json order. */
export function locateStages(variants: readonly IAgentProfile[]): LocatedStage[] {
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

/**
 * Validate the role of every `mode: "local"` stage, variant and post-task hook stages alike: it names the stage's
 * workspace directory on the host, so it must be a safe directory name.
 *
 * @param variants The profile's variants as `resolveProfileVariants` expands them.
 * @param prefix Location prefix for messages (`profiles/<id>`).
 */
export function validateHostStageRoles(variants: readonly IAgentProfile[], prefix: string, errors: string[]): void {
  for (const { stage, path } of locateStages(variants)) {
    if (stage.mode === StageMode.Local && !isSafeName(stage.role)) {
      errors.push(
        `${prefix}/${path}: role ${JSON.stringify(stage.role)} names the stage's workspace directory on the host\n` +
          "  Use letters, digits, _ and -, starting with a letter or digit",
      );
    }
  }
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
 * Validate what each stage's resolved CLI implies for one profile: the stage sets only options that
 * CLI supports, CLI-specific profile options apply to some stage, and the stage's model is one that
 * CLI accepts.
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

  for (const { stage, path } of stages) {
    if (stage.cli === CliType.Claude && stage.mode === StageMode.Local) {
      errors.push(`${prefix}/${path}: runs cli "claude" in mode "local", but host stages run only Copilot CLI`);
    }
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

  const claudeContainerStage = stages.some(
    ({ stage }) => stage.cli === CliType.Claude && stage.mode === StageMode.Container,
  );
  if (parsed.claude.loadRepoInstructions && !claudeContainerStage) {
    errors.push(
      `${prefix}: claude.loadRepoInstructions only affects container stages that run cli "claude", but none does\n` +
        `  Remove claude.loadRepoInstructions or set it to false`,
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
