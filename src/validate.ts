import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { resolvePath } from "./util/path.js";

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

  validateProfiles(errors, warnings);
}

function validateProfiles(errors: string[], warnings: string[]): void {
  const profilesDir = resolve(process.cwd(), "profiles");

  if (!existsSync(profilesDir)) {
    errors.push(
      `profiles/ directory not found at ${profilesDir}\n` +
      `  Create profile directories under profiles/ with a profile.json in each`
    );
    return;
  }

  let dirs: string[];
  try {
    dirs = readdirSync(profilesDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
  } catch {
    errors.push(`Cannot read profiles directory: ${profilesDir}`);
    return;
  }

  if (dirs.length === 0) {
    errors.push(`No profile directories found in ${profilesDir}`);
    return;
  }

  for (const dirName of dirs) {
    const profileJsonPath = join(profilesDir, dirName, "profile.json");
    const prefix = `profiles/${dirName}`;

    if (!existsSync(profileJsonPath)) {
      errors.push(`${prefix}: profile.json not found`);
      continue;
    }

    let p: any;
    try {
      p = JSON.parse(readFileSync(profileJsonPath, "utf-8"));
    } catch (e) {
      errors.push(`${prefix}: profile.json is not valid JSON: ${e instanceof Error ? e.message : String(e)}`);
      continue;
    }

    if (!p.repo) {
      errors.push(`${prefix}: repo path is required`);
    } else {
      const repoPath = resolvePath(p.repo);
      if (!existsSync(repoPath)) {
        errors.push(
          `${prefix}: repo path does not exist: ${repoPath}\n` +
          `  Clone the repository or update the path in profile.json`
        );
      }
    }

    const composePath = resolve(process.cwd(), `profiles/${dirName}/docker-compose.yml`);
    if (!existsSync(composePath)) {
      errors.push(
        `${prefix}: docker-compose.yml not found\n` +
        `  Create profiles/${dirName}/docker-compose.yml`
      );
    }

    const variants = p.variants;
    if (!Array.isArray(variants) || variants.length === 0) {
      errors.push(`${prefix}: at least one variant is required`);
      continue;
    }

    const agentsDir = join(profilesDir, dirName, "agents");
    const agentFiles = existsSync(agentsDir)
      ? readdirSync(agentsDir).filter((f) => f.endsWith(".agent.md"))
      : [];
    const availableAgents = agentFiles.map((f) => f.replace(".agent.md", ""));

    for (let i = 0; i < variants.length; i++) {
      const v = variants[i];
      const vPrefix = `${prefix}/variants[${i}]`;

      if (!v.agent) {
        errors.push(`${vPrefix}: agent name is required`);
      } else if (agentFiles.length > 0 && !availableAgents.includes(v.agent)) {
        errors.push(
          `${vPrefix}: agent "${v.agent}" not found in ${prefix}/agents/\n` +
          `  Available agents: ${availableAgents.join(", ")}\n` +
          `  Agent files use the pattern: <name>.agent.md`
        );
      }

      if (!v.match?.projects?.length) {
        warnings.push(`${vPrefix}: no match.projects defined — this variant won't match any issues`);
      }

      if (!v.match?.commentTrigger) {
        errors.push(`${vPrefix}: match.commentTrigger is required`);
      }

      const revisionStatuses: string[] = v.match?.revisionStatuses ?? [];
      const statuses: string[] = v.match?.statuses ?? [];
      if (revisionStatuses.length > 0 && statuses.length > 0) {
        const statusesLower = new Set(statuses.map((s: string) => s.toLowerCase()));
        for (const rs of revisionStatuses) {
          if (!statusesLower.has(rs.toLowerCase())) {
            errors.push(
              `${vPrefix}: revisionStatuses value "${rs}" is not in statuses [${statuses.join(", ")}]\n` +
              `  revisionStatuses must be a subset of statuses`
            );
          }
        }
      }
    }

    validateAgentMounts(composePath, agentsDir, agentFiles, prefix, errors);
  }
}

/**
 * Verify that every .agent.md file in the agents/ directory has a matching
 * volume mount in docker-compose.yml sourcing from agents/.build/<filename>.
 */
function validateAgentMounts(
  composePath: string,
  agentsDir: string,
  agentFiles: string[],
  prefix: string,
  errors: string[],
): void {
  if (!existsSync(composePath) || agentFiles.length === 0) return;

  let composeContent: string;
  try {
    composeContent = readFileSync(composePath, "utf-8");
  } catch {
    return;
  }

  for (const agentFile of agentFiles) {
    const expectedMount = `./agents/.build/${agentFile}`;
    if (!composeContent.includes(expectedMount)) {
      errors.push(
        `${prefix}: agent file "${agentFile}" has no volume mount in docker-compose.yml\n` +
        `  Add a mount: ${expectedMount}:/workspace/.github/agents/${agentFile}:ro`
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
