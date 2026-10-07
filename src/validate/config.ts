import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { configFileSchema } from "../config/schemas";
import { validateCliCredentials } from "./credentials";
import { validateProfiles } from "./profiles";
import type { ValidationCollector } from "./types";

/**
 * Validate config.json, the profiles, and the credentials of the CLIs the profiles' stages run
 * under the configured `claudeAuth`.
 */
export async function validateConfigFile(collector: ValidationCollector): Promise<void> {
  const configPath = resolve(process.cwd(), "config.json");

  if (!existsSync(configPath)) {
    collector.errors.push(
      `config.json not found at ${configPath}\n` +
        `  Copy config.json.sample to config.json and adjust as needed:\n` +
        `  cp config.json.sample config.json`,
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

  const claudeAuth = configFileSchema.shape.claudeAuth.safeParse(raw.claudeAuth);
  if (!claudeAuth.success) {
    collector.errors.push(...claudeAuth.error.issues.map((issue) => `config.json: claudeAuth: ${issue.message}`));
  }

  const profiles = await validateProfiles(collector);
  if (claudeAuth.success) {
    validateCliCredentials(profiles, claudeAuth.data, process.env, collector);
  }
}
