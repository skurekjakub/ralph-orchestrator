import { z } from "zod";
import { ClaudeAuthMode, CliType, ReasoningEffort, StageMode, VcsProvider } from "./types";

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
});

export const rawOutputSchema = z
  .object({
    logDir: z.string().default("./output/logs"),
  })
  .optional();

export const rawDashboardSchema = z
  .object({
    enabled: z.boolean().default(true),
    intervalMs: z.number().positive().default(30_000),
  })
  .optional();

export const rawPromptAuditSchema = z
  .object({
    /** How the auditor handles findings: "block" rejects critical findings, "warn" logs only, "off" skips. */
    mode: z.enum(["block", "warn", "off"]).default("warn"),
  })
  .optional();

export const rawRalphchivesSchema = z
  .object({
    enabled: z.boolean().default(false),
    nodebbApiUrl: z.url().default("http://localhost:4567"),
    neo4jUri: z.string().default("bolt://localhost:7687"),
    neo4jUser: z.string().default("neo4j"),
  })
  .optional();

export const configFileSchema = z.object({
  dataSources: z
    .record(z.string(), dataSourceConfigSchema)
    .refine((ds) => Object.keys(ds).length > 0, "At least one data source must be defined"),
  output: rawOutputSchema,
  dashboard: rawDashboardSchema,
  promptAudit: rawPromptAuditSchema,
  ralphchives: rawRalphchivesSchema,
  /** Allow agents to resume a session that ends without the result its stage requires (`--continue` on Copilot CLI, `--resume <session id>` on Claude Code). Requires maxContinuations > 0 in the profile. */
  enableContinuation: z.boolean().default(false),
  /** Credential Claude Code stages authenticate with: `CLAUDE_CODE_OAUTH_TOKEN` or `ANTHROPIC_API_KEY`. */
  claudeAuth: z.enum(ClaudeAuthMode).default(ClaudeAuthMode.OAuthToken),
});

// ---------------------------------------------------------------------------
// Zod schemas for profiles/*/profile.json
// ---------------------------------------------------------------------------

export const profileMatchSchema = z.object({
  projects: z.array(z.string()).default([]),
  statuses: z.array(z.string()).default([]),
  commentTrigger: z.string("match.commentTrigger is required").min(1, "match.commentTrigger is required"),
  revisionStatuses: z.array(z.string()).default([]),
});

export const agentTransitionSchema = z
  .object({
    targetStatus: z.string().optional(),
  })
  .default({});

export const stageSchema = z.object({
  /** Agent CLI name (e.g. `ralph.ralph`). */
  agent: z.string("agent name is required").min(1, "agent name is required"),
  /** Unique role within the pipeline (e.g. `primary`, `reviewer`). */
  role: z.string("stage role is required").min(1, "stage role is required"),
  /** Where the agent runs: inside Docker (`container`) or on the host (`local`). */
  mode: z.enum(StageMode).default(StageMode.Container),
  /** CLI for this stage. Falls back to the profile `cli`. */
  cli: z.enum(CliType).optional(),
  /** Skill names from shared/skills/ to mount. Per-stage override. */
  skills: z.array(z.string()).default([]),
  /** Model override for this stage. */
  model: z.string().optional(),
  /** Claude Code reasoning effort (`--effort`). Claude stages only. */
  effort: z.enum(ReasoningEffort).optional(),
  /** Fail the stage when the agent ends without a result: structured output on Claude Code, the result block on Copilot CLI. Defaults to true for variant stages, false for post-task hook stages. */
  requireResultBlock: z.boolean().optional(),
  /** Timeout override in ms for this stage. */
  timeoutMs: z.number().positive().optional(),
});

export const postTaskHookSchema = z.object({
  /** Hook identifier — lowercase alphanumeric with hyphens. */
  name: z
    .string()
    .min(1)
    .regex(/^[a-z0-9-]+$/, "Hook name must be lowercase alphanumeric with hyphens"),
  /** Sequential local-only stages within this hook. */
  stages: z
    .array(stageSchema)
    .min(1, "Post-task hook must have at least one stage")
    .refine((stages) => stages.every((s) => s.mode === StageMode.Local), "Post-task hook stages must be mode: 'local'")
    .refine(
      (stages) => new Set(stages.map((s) => s.role)).size === stages.length,
      "Stage roles must be unique within a hook",
    ),
});

export const mcpServerEntrySchema = z.union([
  z.string(),
  z.object({
    name: z.string().min(1, "MCP server entry name must not be empty"),
    env: z.record(z.string(), z.string()).optional(),
    /** Container-level env vars injected into the sidecar service (for entrypoint scripts). */
    sidecarEnv: z.record(z.string(), z.string()).optional(),
  }),
]);

export const variantSchema = z.object({
  description: z.string().optional(),
  stages: z
    .array(stageSchema, "stages must be an array")
    .min(1, "at least one stage is required")
    .refine((stages) => {
      const roles = stages.map((s) => s.role);
      return new Set(roles).size === roles.length;
    }, "Stage roles must be unique within a variant"),
  model: z.string().optional(),
  match: profileMatchSchema,
  beforeAgent: agentTransitionSchema,
  afterAgent: agentTransitionSchema,
  preflight: z.string().optional(),
  failureComment: z.string().optional(),
  postTaskHooks: z
    .array(postTaskHookSchema)
    .default([])
    .refine(
      (hooks) => new Set(hooks.map((h) => h.name)).size === hooks.length,
      "Post-task hook names must be unique within a variant",
    ),
  /** Additional MCP servers for this variant (merged with profile-level mcpServers). */
  mcpServers: z.array(mcpServerEntrySchema).default([]),
});

/** Resource mount config — auto-discovers files in the profile's resources/ directory. */
export const resourcesSchema = z
  .object({
    /** Container path prefix (relative to /workspace) where resource files are mounted. */
    mountBase: z.string().min(1),
  })
  .optional();

export const profileFileSchema = z.object({
  /** HTTPS URL of the target repository, without credentials: the orchestrator clones it and tasks push to it. */
  repoUrl: z
    .url({
      protocol: /^https$/,
      error: (issue) => (issue.input === undefined ? "repoUrl is required" : "repoUrl must be an https:// URL"),
    })
    .refine((url) => {
      // Zod runs this check even after the URL check failed, on input `URL` cannot parse.
      const parsed = URL.parse(url);
      return parsed === null || (parsed.username === "" && parsed.password === "");
    }, "repoUrl must not carry credentials; the orchestrator authenticates with the repoPat env var"),
  /** Data source key — must reference an entry in config.json `dataSources`. */
  dataSource: z.string("dataSource is required").min(1, "dataSource is required"),
  /** VCS platform for the repo (determines git auth format). */
  vcsProvider: z.enum(VcsProvider).default(VcsProvider.Ado),
  /** Env var name holding the git PAT that clones and fetches `repoUrl`. Defaults to `ADO_PAT` (ado) or `GH_TOKEN` (github). */
  repoPat: z.string().optional(),
  /** Default CLI for the profile's stages; `stages[].cli` overrides it per stage. */
  cli: z.enum(CliType).default(CliType.Claude),
  model: z.string().optional(),
  timeoutMs: z.number().positive().default(1_800_000),
  setupScript: z.string().default("/usr/local/bin/setup.sh"),
  auditLogPath: z.string().default("/workspace/.ralph/logs/audit.jsonl"),
  composeProjectLabel: z.string().default("ralph-sandbox"),
  /** Paths inside the container (absolute) to delete before each agent run. */
  cleanPaths: z.array(z.string()).default([]),
  /** Max continuation attempts when the agent does not report the result its stage requires. 0 = disabled (default). */
  maxContinuations: z.number().int().min(0).max(10).default(0),
  /** MCP servers to deploy into the container (references shared/mcp-servers/<name>/). */
  mcpServers: z.array(mcpServerEntrySchema).default([]),
  /** Additional domains to allow through the Squid egress proxy for this profile's agent container. */
  allowlistDomains: z.array(z.string().min(1)).default([]),
  /**
   * Control the bundled GitHub MCP server in Copilot CLI (only affects cli: "copilot").
   * - `false` (default): server disabled (`--disable-builtin-mcps`)
   * - `["get_file_contents", ...]`: enable only the listed tools (`--add-github-mcp-tool`)
   */
  githubMcpTools: z
    .union([
      z.literal(false),
      z.array(z.string()).refine((a) => a.length > 0, "githubMcpTools must list at least one tool when enabled"),
    ])
    .default(false),
  /** Claude Code options for the profile's container stages that run cli "claude". */
  claude: z
    .object({
      /** Load the target repo's own CLAUDE.md files and `.claude/` project settings. Off by default for deterministic runs. */
      loadRepoInstructions: z.boolean().default(false),
    })
    .default({ loadRepoInstructions: false }),
  /** Resource files auto-discovered from the profile's resources/ directory and mounted into the container. */
  resources: resourcesSchema,
  variants: z.array(variantSchema, "at least one variant is required").min(1, "at least one variant is required"),
});

/** A `profiles/<id>/profile.json` after schema validation, with defaults applied. */
export type ProfileFile = z.output<typeof profileFileSchema>;

/** One `stages[]` entry of a profile.json variant or post-task hook. */
export type StageFile = z.output<typeof stageSchema>;
