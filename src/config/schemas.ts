import { z } from "zod";

// ---------------------------------------------------------------------------
// Zod schemas for config.json (global settings only)
// ---------------------------------------------------------------------------

/** JIRA-specific connection properties validated inside `dataSources.<key>.connection`. */
export const jiraConnectionSchema = z.object({
  baseUrl: z.string().url("connection.baseUrl must be a valid URL"),
  cloudId: z.string().min(1, "connection.cloudId must not be empty"),
  excludeFields: z.array(z.string()).default([]),
  allowedUsers: z.array(z.string()).default([]),
});

/** Per-data-source entry in the `dataSources` config map. */
export const dataSourceConfigSchema = z.object({
  type: z.string().min(1, "Data source type must not be empty"),
  connection: z.record(z.string(), z.unknown()),
  pollIntervalMs: z.number().positive().default(60_000),
  maxResults: z.number().positive().default(100),
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
  dataSources: z.record(z.string(), dataSourceConfigSchema).refine(
    (ds) => Object.keys(ds).length > 0,
    "At least one data source must be defined",
  ),
  /** Module specifiers loaded before the DI container is created. Each module should self-register (e.g. call registerDataSourceFactory). */
  plugins: z.array(z.string()).default([]),
  output: rawOutputSchema,
  dashboard: rawDashboardSchema,
  promptAudit: rawPromptAuditSchema,
  ralphchives: rawRalphchivesSchema,
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

export const stageSchema = z.object({
  /** Agent CLI name (e.g. `ralph.ralph`). */
  agent: z.string().min(1, "stage agent must not be empty"),
  /** Unique role within the pipeline (e.g. `primary`, `reviewer`). */
  role: z.string().min(1, "stage role must not be empty"),
  /** Where the agent runs: inside Docker (`container`) or on the host (`local`). */
  mode: z.enum(["container", "local"]).default("container"),
  /** Skill names from shared/skills/ to mount. Per-stage override. */
  skills: z.array(z.string()).default([]),
  /** Model override for this stage. */
  model: z.string().optional(),
  /** Timeout override in ms for this stage. */
  timeoutMs: z.number().positive().optional(),
});

export const variantSchema = z.object({
  stages: z.array(stageSchema).min(1, "At least one stage is required").refine(
    (stages) => {
      const roles = stages.map((s) => s.role);
      return new Set(roles).size === roles.length;
    },
    "Stage roles must be unique within a variant",
  ),
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
  /** Data source key — must reference an entry in config.json `dataSources`. */
  dataSource: z.string().min(1, "Profile dataSource must not be empty"),
  /** VCS platform for the repo (determines git auth format). */
  vcsProvider: z.enum(["ado", "github"]).default("ado"),
  /** Env var name containing the git PAT for repo sync. Defaults to `ADO_PAT` (ado) or `GH_TOKEN` (github). */
  repoPat: z.string().optional(),
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
  variants: z.array(variantSchema).min(1, "At least one variant must be defined"),
});
