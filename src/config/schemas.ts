import { z } from "zod";

// ---------------------------------------------------------------------------
// Zod schemas for config.json (global settings only)
// ---------------------------------------------------------------------------

export const rawJiraSchema = z.object({
  baseUrl: z.string().url("jira.baseUrl must be a valid URL"),
  cloudId: z.string().min(1, "jira.cloudId must not be empty"),
  pollIntervalMs: z.number().positive().default(60_000),
});

export const rawOutputSchema = z.object({
  logDir: z.string().default("./output/logs"),
  handoffDir: z.string().default("./output/handoffs"),
}).optional();

export const rawDashboardSchema = z.object({
  enabled: z.boolean().default(true),
  intervalMs: z.number().positive().default(30_000),
}).optional();

export const rawPromptAuditSchema = z.object({
  /** How the auditor handles findings: "block" rejects critical findings, "warn" logs only, "off" skips. */
  mode: z.enum(["block", "warn", "off"]).default("warn"),
}).optional();

export const rawRalphchivesSchema = z.object({
  enabled: z.boolean().default(false),
  nodebbApiUrl: z.url().default("http://localhost:4567"),
  neo4jUri: z.string().default("bolt://localhost:7687"),
  neo4jUser: z.string().default("neo4j"),
}).optional();

export const configFileSchema = z.object({
  jira: rawJiraSchema,
  output: rawOutputSchema,
  dashboard: rawDashboardSchema,
  promptAudit: rawPromptAuditSchema,
  ralphchives: rawRalphchivesSchema,
  /** Custom field IDs to exclude from agent prompts (e.g. boilerplate form templates). */
  excludeFields: z.array(z.string()).default([]),
  /** JIRA accountIds allowed to trigger agent invocations. Empty array = unrestricted. */
  allowedUsers: z.array(z.string()).default([]),
  /** Allow agents to retry via --continue when no result block is produced. Requires maxContinuations > 0 in the profile. */
  enableContinuation: z.boolean().default(false),
});

// ---------------------------------------------------------------------------
// Zod schemas for profiles/*/profile.json
// ---------------------------------------------------------------------------

export const profileMatchSchema = z.object({
  projects: z.array(z.string()).default([]),
  statuses: z.array(z.string()).default([]),
  commentTrigger: z.string().min(1, "match.commentTrigger is required"),
  revisionStatuses: z.array(z.string()).default([]),
});

export const agentTransitionSchema = z.object({
  targetStatus: z.string().optional(),
}).default({});

export const variantSchema = z.object({
  agent: z.string().min(1, "variant agent must not be empty"),
  model: z.string().optional(),
  match: profileMatchSchema,
  beforeAgent: agentTransitionSchema,
  afterAgent: agentTransitionSchema,
  preflight: z.string().optional(),
  failureComment: z.string().optional(),
});

/** Resource mount config — auto-discovers files in the profile's resources/ directory. */
export const resourcesSchema = z.object({
  /** Container path prefix (relative to /workspace) where resource files are mounted. */
  mountBase: z.string().min(1),
}).optional();

export const mcpServerEntrySchema = z.union([
  z.string(),
  z.object({
    name: z.string().min(1, "MCP server entry name must not be empty"),
    env: z.record(z.string(), z.string()).optional(),
  }),
]);

export const profileFileSchema = z.object({
  repo: z.string().min(1, "Profile repo path must not be empty"),
  cli: z.enum(["copilot", "claude"]).default("copilot"),
  model: z.string().optional(),
  timeoutMs: z.number().positive().default(1_800_000),
  setupScript: z.string().default("/usr/local/bin/setup.sh"),
  auditLogPath: z.string().default("/workspace/.ralph/logs/audit.jsonl"),
  composeProjectLabel: z.string().default("ralph-sandbox"),
  /** Paths inside the container (absolute) to delete before each agent run. */
  cleanPaths: z.array(z.string()).default([]),
  /** Max continuation attempts when the agent doesn't produce a result block. 0 = disabled (default). */
  maxContinuations: z.number().int().min(0).max(10).default(0),
  /** MCP servers to deploy into the container (references shared/mcp-servers/<name>/). */
  mcpServers: z.array(mcpServerEntrySchema).default([]),
  /**
   * Control the bundled GitHub MCP server in Copilot CLI (only affects cli: "copilot").
   * - `false` (default): server disabled (`--disable-builtin-mcps`)
   * - `["get_file_contents", ...]`: enable only the listed tools (`--add-github-mcp-tool`)
   */
  githubMcpTools: z.union([
    z.literal(false),
    z.array(z.string()).refine((a) => a.length > 0, "githubMcpTools must list at least one tool when enabled"),
  ]).default(false),
  /** Resource files auto-discovered from the profile's resources/ directory and mounted into the container. */
  resources: resourcesSchema,
  /** Skill names from shared/skills/ to mount into the container at .github/skills/. */
  skills: z.array(z.string()).default([]),
  variants: z.array(variantSchema).min(1, "At least one variant must be defined"),
});
