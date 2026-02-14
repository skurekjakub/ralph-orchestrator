import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

interface ValidationResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validate all prerequisites before starting the orchestrator.
 *
 * Checks:
 * - `.env` file exists and has all required variables
 * - `config.json` exists and has valid structure
 * - Agent profile repo paths exist on disk
 * - Docker daemon is reachable
 *
 * Returns a result with errors (fatal) and warnings (non-fatal).
 */
export async function validatePrerequisites(): Promise<ValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];

  validateEnvFile(errors, warnings);
  validateConfigFile(errors, warnings);
  await validateDocker(errors);

  return { ok: errors.length === 0, errors, warnings };
}

function validateEnvFile(errors: string[], warnings: string[]): void {
  const envPath = resolve(process.cwd(), ".env");

  if (!existsSync(envPath)) {
    errors.push(
      `.env file not found at ${envPath}\n` +
      `  Copy .env.example to .env and fill in the required values:\n` +
      `  cp .env.example .env`
    );
    return;
  }

  const content = readFileSync(envPath, "utf-8");
  const vars = parseEnvFile(content);

  const required: [string, string][] = [
    ["JIRA_PAT", "API token from id.atlassian.com — needed for JIRA integration"],
    ["JIRA_EMAIL", "Atlassian account email — needed for JIRA Basic auth"],
    ["GH_TOKEN", "GitHub PAT with Copilot Requests permission — needed for Copilot CLI"],
    ["ADO_PAT_DOCS", "Azure DevOps PAT for the docs repo — needed for git push + PR creation"],
  ];

  for (const [name, hint] of required) {
    const value = process.env[name] ?? vars[name];
    if (!value) {
      errors.push(`Missing required env var: ${name}\n  ${hint}`);
    }
  }

  const optional: [string, string][] = [
    ["ADO_PAT_XPERIENCE", "Azure DevOps PAT for Xperience repo — optional, skips Xperience clone if not set"],
    ["DASHBOARD_URL", "Ralph Status Dashboard URL — optional, enables heartbeat reporting"],
    ["DASHBOARD_SECRET", "Dashboard shared secret — optional, required if DASHBOARD_URL is set"],
  ];

  for (const [name, hint] of optional) {
    const value = process.env[name] ?? vars[name];
    if (!value) {
      warnings.push(`Optional env var not set: ${name}\n  ${hint}`);
    }
  }
}

function validateConfigFile(errors: string[], warnings: string[]): void {
  const configPath = resolve(process.cwd(), "config.json");

  if (!existsSync(configPath)) {
    errors.push(
      `config.json not found at ${configPath}\n` +
      `  Copy config.json.sample to config.json and adjust as needed:\n` +
      `  cp config.json.sample config.json`
    );
    return;
  }

  let raw: any;
  try {
    raw = JSON.parse(readFileSync(configPath, "utf-8"));
  } catch (e) {
    errors.push(`config.json is not valid JSON: ${e instanceof Error ? e.message : String(e)}`);
    return;
  }

  if (!raw.jira?.baseUrl) {
    errors.push("config.json: jira.baseUrl is required");
  }
  if (!raw.jira?.cloudId) {
    errors.push("config.json: jira.cloudId is required");
  }

  const profiles = raw.profiles;
  if (!Array.isArray(profiles) || profiles.length === 0) {
    errors.push("config.json: at least one agent profile must be defined in the profiles array");
    return;
  }

  for (let i = 0; i < profiles.length; i++) {
    const p = profiles[i];
    const prefix = `config.json: profiles[${i}]`;

    if (!p.id) errors.push(`${prefix}: id is required`);
    if (!p.repo) {
      errors.push(`${prefix}: repo path is required`);
    } else {
      const repoPath = resolvePath(p.repo);
      if (!existsSync(repoPath)) {
        errors.push(
          `${prefix}: repo path does not exist: ${repoPath}\n` +
          `  Clone the repository or update the path in config.json`
        );
      }
    }

    if (!p.match?.projects?.length) {
      warnings.push(`${prefix}: no match.projects defined — this profile won't match any issues`);
    }

    if (!p.transitions?.inProgressId) {
      errors.push(`${prefix}: transitions.inProgressId is required`);
    }
    if (!p.transitions?.readyForReviewId) {
      errors.push(`${prefix}: transitions.readyForReviewId is required`);
    }

    const statuses = new Set((p.match?.statuses ?? []).map((s: string) => s.toLowerCase()));
    const revisionStatuses: string[] = p.match?.revisionStatuses ?? [];
    const overlap = revisionStatuses.filter((s: string) => statuses.has(s.toLowerCase()));
    if (overlap.length > 0) {
      errors.push(
        `${prefix}: statuses and revisionStatuses must not overlap — ` +
        `found in both: ${overlap.join(", ")}`
      );
    }
  }
}

async function validateDocker(errors: string[]): Promise<void> {
  try {
    const { execa } = await import("execa");
    await execa("docker", ["info"], { timeout: 10_000 });
  } catch {
    errors.push(
      "Docker is not running or not accessible\n" +
      "  Start Docker Desktop or the Docker daemon before running the orchestrator"
    );
  }
}

function resolvePath(rawPath: string): string {
  const cleaned = rawPath.replace(/^["']|["']$/g, "");
  return cleaned.startsWith("~/")
    ? resolve(process.env.HOME ?? "/root", cleaned.slice(2))
    : resolve(cleaned);
}

function parseEnvFile(content: string): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    const value = trimmed.slice(eqIndex + 1).trim().replace(/^["']|["']$/g, "");
    if (key && value) vars[key] = value;
  }
  return vars;
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
