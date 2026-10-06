import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ValidationCollector } from "./types.js";

export function validateEnvFile({ errors, warnings }: ValidationCollector): void {
  const envPath = resolve(process.cwd(), ".env");

  if (!existsSync(envPath)) {
    errors.push(
      `.env file not found at ${envPath}\n` +
        `  Copy .env.example to .env and fill in the required values:\n` +
        `  cp .env.example .env`,
    );
    return;
  }

  const content = readFileSync(envPath, "utf-8");
  const vars = parseEnvFile(content);

  const required: [string, string][] = [
    ["GH_TOKEN", "GitHub PAT with Copilot Requests permission — needed for Copilot CLI"],
    ["ADO_PAT", "Azure DevOps PAT for the ADO MCP server — needed for PR creation and review threads"],
  ];

  for (const [name, hint] of required) {
    const value = process.env[name] ?? vars[name];
    if (!value) {
      errors.push(`Missing required env var: ${name}\n  ${hint}`);
    }
  }

  // Per-data-source credentials are validated by each connector factory, not here.
  // Example: JIRA factory checks JIRA_PAT_<KEY>, JIRA_EMAIL_<KEY>

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

function parseEnvFile(content: string): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    const value = trimmed
      .slice(eqIndex + 1)
      .trim()
      .replace(/^["']|["']$/g, "");
    if (key && value) vars[key] = value;
  }
  return vars;
}
