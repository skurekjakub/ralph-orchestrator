export type { ValidationResult } from "./types.js";

import type { ValidationResult } from "./types.js";
import { validateEnvFile } from "./env.js";
import { validateConfigFile } from "./config.js";
import { validateSecurityInfra } from "./security.js";
import { validateDocker } from "./docker.js";

/**
 * Validate all prerequisites before starting the orchestrator.
 *
 * Checks:
 * - `.env` file exists and has all required variables
 * - `config.json` exists and has valid structure
 * - Agent profile repo paths, variants, and compose files
 * - Security infrastructure (Squid proxy, network isolation)
 * - Docker daemon is reachable
 *
 * Returns a result with errors (fatal) and warnings (non-fatal).
 */
export async function validatePrerequisites(): Promise<ValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];

  validateEnvFile({ errors, warnings });
  validateConfigFile({ errors, warnings });
  validateSecurityInfra({ errors, warnings });
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
