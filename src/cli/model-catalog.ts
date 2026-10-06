import { CliType } from "../config/types";

/** Claude Code model aliases. The pinned Claude Code version decides which model each one resolves to. */
export enum ClaudeModelAlias {
  Opus = "opus",
  Sonnet = "sonnet",
  Haiku = "haiku",
  Fable = "fable",
}

/** Suffix that selects a model's 1M-token context window in Claude Code (`opus[1m]`). */
const ONE_M_CONTEXT_SUFFIX = "[1m]";

/** Full Claude Code model ids: hyphenated, with an optional date and `[1m]` suffix (`claude-opus-5-5`, `claude-haiku-4-5-20251001`). */
export const CLAUDE_MODEL_ID = /^claude-[a-z]+(-\d+)+(\[1m\])?$/;

/** A Claude Code id split into family, major, optional minor, optional date and optional `[1m]`. */
const CLAUDE_MODEL_ID_PARTS = /^claude-([a-z]+)-(\d+)(?:-(\d{1,2}))?(-\d{8})?(\[1m\])?$/;

/** A Copilot-style Claude id with a dotted version (`claude-opus-4.6`). */
const DOTTED_CLAUDE_MODEL_ID = /^claude-([a-z]+)-(\d+)\.(\d+)$/;

/** Copilot model ids: lowercase words of letters and digits joined by `.` or `-` (`claude-opus-4.6`, `gpt-5.3-codex`). */
const COPILOT_MODEL_ID = /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/;

/** Copilot model for each Claude Code alias, used when an agent declares no Copilot-specific model. */
export const COPILOT_MODEL_FOR_ALIAS: Readonly<Record<ClaudeModelAlias, string>> = {
  [ClaudeModelAlias.Opus]: "claude-opus-4.6",
  [ClaudeModelAlias.Sonnet]: "claude-sonnet-4.6",
  [ClaudeModelAlias.Haiku]: "claude-haiku-4.5",
  [ClaudeModelAlias.Fable]: "claude-opus-4.6",
};

/** Model Copilot CLI runs when neither the stage, the variant nor the profile sets one. */
export const DEFAULT_COPILOT_MODEL = "claude-opus-4.6";

/** Validates and translates model references for one CLI. */
export interface ICliModelPolicy {
  /** Model the CLI runs when no stage, variant or profile sets one; undefined leaves the choice to the agent definition. */
  readonly defaultModel?: string;
  /**
   * Checks that `model` is a model reference this CLI accepts.
   *
   * @returns null when valid, otherwise the reason, with the replacement to use when one exists.
   */
  validate(model: string): string | null;
  /**
   * Maps a canonical model reference (a Claude Code alias or full id) to this CLI's model string.
   *
   * @param overrides Per-CLI models the agent declares; they win over the mapping.
   * @throws Error when the model has no equivalent for this CLI.
   */
  fromCanonical(model: string, overrides?: { readonly copilot?: string }): string;
}

/** The alias `model` names, with or without the `[1m]` suffix, or undefined when it is not an alias. */
function claudeAliasOf(model: string): ClaudeModelAlias | undefined {
  const base = model.endsWith(ONE_M_CONTEXT_SUFFIX) ? model.slice(0, -ONE_M_CONTEXT_SUFFIX.length) : model;
  return Object.values(ClaudeModelAlias).find((alias) => alias === base);
}

/** The Copilot id of a full Claude Code id (`claude-haiku-4-5-20251001` → `claude-haiku-4.5`), or undefined when `model` is not one. */
function copilotIdForClaudeId(model: string): string | undefined {
  const parts = CLAUDE_MODEL_ID_PARTS.exec(model);
  if (!parts) return undefined;
  const [, family, major, minor] = parts;
  return minor === undefined ? `claude-${family}-${major}` : `claude-${family}-${major}.${minor}`;
}

/** Claude Code accepts its aliases and full ids; the pinned CLI version resolves aliases. */
export const CLAUDE_MODEL_POLICY: ICliModelPolicy = {
  defaultModel: undefined,

  validate(model: string): string | null {
    if (claudeAliasOf(model) !== undefined || CLAUDE_MODEL_ID.test(model)) return null;

    const dotted = DOTTED_CLAUDE_MODEL_ID.exec(model);
    if (dotted) {
      const [, family, major, minor] = dotted;
      const alias = Object.values(ClaudeModelAlias).find((a) => a === family);
      const aliasHint = alias === undefined ? "" : `"${alias}" or `;
      return `model "${model}" is a Copilot model id; Claude Code takes ${aliasHint}"claude-${family}-${major}-${minor}"`;
    }

    return (
      `model "${model}" is not a Claude Code model; use an alias ` +
      `(${Object.values(ClaudeModelAlias).join(", ")}, optionally with ${ONE_M_CONTEXT_SUFFIX}) ` +
      `or a full id such as "claude-opus-5-5"`
    );
  },

  fromCanonical(model: string): string {
    return model;
  },
};

/** Copilot CLI takes its own dotted model ids; Claude Code aliases and hyphenated ids are rejected with the Copilot id to use. */
export const COPILOT_MODEL_POLICY: ICliModelPolicy = {
  defaultModel: DEFAULT_COPILOT_MODEL,

  validate(model: string): string | null {
    const alias = claudeAliasOf(model);
    if (alias !== undefined) {
      return `model "${model}" is a Claude Code alias; Copilot CLI takes a Copilot model id such as "${COPILOT_MODEL_FOR_ALIAS[alias]}"`;
    }

    const parts = CLAUDE_MODEL_ID_PARTS.exec(model);
    if (parts) {
      const [, , , minor, date, oneM] = parts;
      if (minor !== undefined || date !== undefined || oneM !== undefined) {
        return `model "${model}" is a Claude Code model id; Copilot CLI takes "${copilotIdForClaudeId(model)}"`;
      }
    }

    if (!COPILOT_MODEL_ID.test(model)) {
      return (
        `model "${model}" is not a valid Copilot model id ` +
        `(lowercase letters and digits joined by "." or "-", such as "claude-opus-4.6" or "gpt-5.4")`
      );
    }
    return null;
  },

  fromCanonical(model: string, overrides?: { readonly copilot?: string }): string {
    if (overrides?.copilot !== undefined) return overrides.copilot;

    const alias = claudeAliasOf(model);
    if (alias !== undefined) return COPILOT_MODEL_FOR_ALIAS[alias];

    const copilotId = copilotIdForClaudeId(model);
    if (copilotId !== undefined) return copilotId;

    throw new Error(`model "${model}" has no Copilot CLI equivalent; declare copilot.model for the agent`);
  },
};

/** The model policy of `cli`. */
export function modelPolicyFor(cli: CliType): ICliModelPolicy {
  switch (cli) {
    case CliType.Claude:
      return CLAUDE_MODEL_POLICY;
    case CliType.Copilot:
      return COPILOT_MODEL_POLICY;
  }
}
