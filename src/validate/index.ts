// Credential checks read process.env; `npm run validate` must see the same .env as the orchestrator.
import "dotenv/config";
export type { ValidationResult } from "./types";

import { resolve } from "node:path";
import type { Logger } from "../logger";
import type { ValidationResult } from "./types";
import { validateEnvFile } from "./env";
import { validateConfigFile } from "./config";
import { validateSecurityInfra } from "./security";
import { validateDocker } from "./docker";
import { validateSkills } from "./skills";

/**
 * Validate all prerequisites before starting the orchestrator.
 *
 * Checks:
 * - `.env` file exists and has all required variables
 * - `config.json` exists and has valid structure
 * - Agent profile repo paths, variants, compose files and agent graphs
 * - Runtime skill names and frontmatter
 * - Credentials of the CLIs the profiles' stages run
 * - Security infrastructure (Squid proxy, network isolation)
 * - Docker daemon is reachable
 *
 * Returns a result with errors (fatal) and warnings (non-fatal).
 */
export async function validatePrerequisites(logger?: Logger): Promise<ValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];

  logger?.info("Validating .env file");
  validateEnvFile({ errors, warnings });
  logger?.info("Validating config.json");
  validateConfigFile({ errors, warnings });
  logger?.info("Validating runtime skills");
  validateSkills(resolve(process.cwd(), "shared/skills"), { errors, warnings });
  logger?.info("Validating security infrastructure");
  validateSecurityInfra({ errors, warnings });
  logger?.info("Validating Docker availability");
  await validateDocker({ errors, warnings });

  return { ok: errors.length === 0, errors, warnings };
}

/**
 * Print validation results to stderr in a human-friendly format.
 * Returns true if all checks passed (no errors).
 */
export function printValidationResults(result: ValidationResult): boolean {
  if (result.errors.length > 0) {
    console.error("\n❌ Startup validation failed:\n");
    for (const err of result.errors) {
      console.error(`  ERROR: ${err}\n`);
    }
  }

  if (result.warnings.length > 0) {
    const label = result.errors.length > 0 ? "" : "\n";
    console.warn(`${label}⚠️  Warnings:\n`);
    for (const warn of result.warnings) {
      console.warn(`  WARN: ${warn}\n`);
    }
  }

  if (result.ok && result.warnings.length === 0) {
    console.log("\n✅ All prerequisites validated successfully\n");
  } else if (result.ok) {
    console.log("\n✅ Required prerequisites passed (see warnings above)\n");
  }

  return result.ok;
}
