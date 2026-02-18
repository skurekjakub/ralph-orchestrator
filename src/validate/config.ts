import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { validateProfiles } from "./profiles.js";
import type { ValidationCollector } from "./types.js";

export function validateConfigFile(collector: ValidationCollector): void {
  const configPath = resolve(process.cwd(), "config.json");

  if (!existsSync(configPath)) {
    collector.errors.push(
      `config.json not found at ${configPath}\n` +
      `  Copy config.json.sample to config.json and adjust as needed:\n` +
      `  cp config.json.sample config.json`
    );
    return;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- validating unknown JSON structure
  let raw: any;
  try {
    raw = JSON.parse(readFileSync(configPath, "utf-8"));
  } catch (e) {
    collector.errors.push(`config.json is not valid JSON: ${e instanceof Error ? e.message : String(e)}`);
    return;
  }

  if (!raw.jira?.baseUrl) {
    collector.errors.push("config.json: jira.baseUrl is required");
  }
  if (!raw.jira?.cloudId) {
    collector.errors.push("config.json: jira.cloudId is required");
  }

  validateProfiles(collector);
}
