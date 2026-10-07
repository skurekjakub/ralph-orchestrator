import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { allowedUrlsOf } from "../../container/setup/url-restrictions";
import type { Logger } from "../../logger";

/** Name of the generated Copilot settings file inside a profile's build directory. */
export const COPILOT_SETTINGS_FILE = "copilot-settings.json";

/** Copilot CLI user settings for container sessions, read from `$COPILOT_HOME/settings.json`. */
export interface CopilotSettings {
  /** URLs and domains Copilot's own tools may reach: the task's Squid allowlist. */
  readonly allowedUrls: readonly string[];
  /**
   * Experimental features on. Set here rather than with `--experimental`, which persists the setting and
   * makes Copilot CLI exit without output when the mounted settings file is read-only.
   */
  readonly experimental: true;
}

/** The settings for a task whose egress allowlist is `squidConf`. */
export function buildCopilotSettings(squidConf: string): CopilotSettings {
  return { allowedUrls: allowedUrlsOf(squidConf), experimental: true };
}

/**
 * Writes the task's Copilot settings into `<buildDir>/copilot-settings.json`, from the task's generated
 * `squid.conf`.
 *
 * @throws Error when the build directory has no `squid.conf`.
 */
export function writeCopilotSettings(buildDir: string, logger: Logger): void {
  const squidConfPath = join(buildDir, "squid.conf");
  if (!existsSync(squidConfPath)) {
    throw new Error(`Cannot write Copilot settings: ${squidConfPath} does not exist`);
  }
  const settings = buildCopilotSettings(readFileSync(squidConfPath, "utf-8"));
  writeFileSync(join(buildDir, COPILOT_SETTINGS_FILE), JSON.stringify(settings, null, 2) + "\n", "utf-8");
  logger.info(
    `Wrote ${COPILOT_SETTINGS_FILE} with ${settings.allowedUrls.length} allowed URLs: ${settings.allowedUrls.join(", ")}`,
  );
}
