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

  if (!raw.dataSources || typeof raw.dataSources !== "object" || Object.keys(raw.dataSources).length === 0) {
    collector.errors.push("config.json: dataSources must contain at least one data source entry");
  } else {
    for (const [key, ds] of Object.entries(raw.dataSources)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- validating unknown JSON structure
      const src = ds as any;
      if (src?.type === "jira") {
        if (!src.connection?.baseUrl) {
          collector.errors.push(`config.json: dataSources.${key}.connection.baseUrl is required`);
        }
        if (!src.connection?.cloudId) {
          collector.errors.push(`config.json: dataSources.${key}.connection.cloudId is required`);
        }
      }
    }
  }

  validateProfiles(collector);
}
