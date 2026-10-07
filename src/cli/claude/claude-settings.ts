import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ProfileBuildPaths } from "../../container/setup/build-paths";
import type { Logger } from "../../logger";
import { toErrorMessage } from "../../util/error";

/** Claude Code managed settings for container sessions. */
export interface ClaudeManagedSettings {
  /** Only managed hooks run; hooks in the target repo or written by the agent are ignored. */
  readonly allowManagedHooksOnly: true;
  /** Empty texts leave commits and PRs without Claude Code attribution. */
  readonly attribution: { readonly commit: ""; readonly pr: "" };
  /** The audit hooks and the result gate. */
  readonly hooks: Readonly<Record<string, unknown>>;
}

/** Directory inside a profile's build directory that holds the Claude Code artifacts. */
export function claudeBuildDir(paths: ProfileBuildPaths): string {
  return join(paths.buildDir, "claude");
}

/** Host path of the managed settings file, mounted read-only at `/etc/claude-code/managed-settings.json`. */
export function managedSettingsPath(paths: ProfileBuildPaths): string {
  return join(claudeBuildDir(paths), "managed-settings.json");
}

/** Host path of the empty user settings file, mounted read-only as `$CLAUDE_CONFIG_DIR/settings.json`. */
export function userSettingsPath(paths: ProfileBuildPaths): string {
  return join(claudeBuildDir(paths), "user-settings.json");
}

/**
 * Managed settings for container sessions: the audit hooks and result gate are the only hooks that run,
 * and commits and PRs carry no Claude Code attribution.
 *
 * @param hooks The content of `shared/hooks/claude/hooks.json`, embedded unchanged.
 */
export function buildManagedSettings(hooks: Readonly<Record<string, unknown>>): ClaudeManagedSettings {
  return {
    allowManagedHooksOnly: true,
    attribution: { commit: "", pr: "" },
    hooks,
  };
}

/**
 * Reads the Claude Code hooks object from `<hooksDir>/claude/hooks.json`.
 *
 * @throws Error when the file is unreadable, not JSON or not a JSON object.
 */
export function readClaudeHooks(hooksDir: string): Readonly<Record<string, unknown>> {
  const path = join(hooksDir, "claude", "hooks.json");
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf-8"));
  } catch (err) {
    throw new Error(`Failed to read Claude Code hooks from ${path}: ${toErrorMessage(err)}`);
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error(`Claude Code hooks in ${path} must be a JSON object keyed by hook event`);
  }
  return parsed as Record<string, unknown>;
}

/**
 * Writes the managed and user settings files of one task into the profile's build directory.
 *
 * @throws Error when `shared/hooks/claude/hooks.json` cannot be read.
 */
export function writeClaudeSettings(paths: ProfileBuildPaths, logger: Logger): void {
  const settings = buildManagedSettings(readClaudeHooks(paths.hooksDir));
  mkdirSync(claudeBuildDir(paths), { recursive: true });
  writeFileSync(managedSettingsPath(paths), JSON.stringify(settings, null, 2) + "\n", "utf-8");
  writeFileSync(userSettingsPath(paths), "{}\n", "utf-8");
  logger.info(`Wrote Claude Code managed settings: ${Object.keys(settings.hooks).length} hook events`);
}
