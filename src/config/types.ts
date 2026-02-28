import type { AuditMode } from "../prompt/prompt-auditor.js";
import type { CliType } from "../container/types.js";

// ---------------------------------------------------------------------------
// Runtime types (post-resolution)
// ---------------------------------------------------------------------------

/** Per-data-source connection config — type-specific fields live in `connection`. */
export interface IDataSourceConfig {
  /** Data source type string (e.g. `"jira"`, `"github"`). Must match a registered factory. */
  readonly type: string;
  /** Type-specific connection properties (validated by the connector). */
  readonly connection: Readonly<Record<string, unknown>>;
  readonly pollIntervalMs: number;
  readonly maxResults: number;
}

/** JIRA-specific connection properties inside `IDataSourceConfig.connection`. */
export interface IJiraConnectionConfig {
  readonly baseUrl: string;
  readonly cloudId: string;
  /** Custom field IDs to exclude from agent prompts. */
  readonly excludeFields: readonly string[];
  /** Atlassian account IDs allowed to trigger agent invocations. Empty = unrestricted. */
  readonly allowedUsers: readonly string[];
  /** JIRA credentials (injected from env vars by the loader — never stored in config.json). */
  readonly email: string;
  readonly apiToken: string;
}

export interface IProfileMatch {
  readonly projects: readonly string[];
  readonly statuses: readonly string[];
  /** Comment trigger string — at least one comment must contain this (case-insensitive) for the variant to match. */
  readonly commentTrigger: string;
  /** Statuses that indicate a revision task (e.g. "Defect Found"). When the issue is in one of these statuses, the agent follows the revision workflow. */
  readonly revisionStatuses: readonly string[];
}

/** Optional JIRA transition to execute before or after agent work. Empty = no transition (observer). */
export interface IAgentTransition {
  readonly targetStatus?: string;
}

export interface IAgentProfile {
  readonly id: string;
  /** Data source key — must reference an entry in `IAppConfig.dataSources`. */
  readonly dataSource: string;
  readonly repoPath: string;
  /** Path to docker-compose.yml relative to the orchestrator root. Defaults to `profiles/<id>/docker-compose.yml`. */
  readonly composeFile: string;
  /** Raw agent name as registered by the CLI (e.g. `ralph.ralph`). Used as the `--agent` argument. */
  readonly agentName: string;
  /** Human-friendly agent name for JIRA comments and logs (strips `ralph.` prefix). */
  readonly displayName: string;
  /** Unique variant identifier: `<profileId>:<agentName>:<commentTrigger>`. Used for ledger dedup and profile lookup. */
  readonly variantKey: string;
  /** Which CLI to use for agent execution. */
  readonly cli: CliType;
  /** Model override (e.g. `claude-opus-4.6`). Optional — CLI default is used when omitted. */
  readonly model?: string;
  readonly timeoutMs: number;
  /** Absolute path to the setup script inside the container. */
  readonly setupScript: string;
  /** Absolute path to the audit JSONL log inside the container. */
  readonly auditLogPath: string;
  /** Docker compose project label for container lookup. */
  readonly composeProjectLabel: string;
  /** Absolute paths inside the container to delete before each agent run. */
  readonly cleanPaths: readonly string[];
  /** Max continuation attempts when the agent doesn't produce a result block. 0 = disabled. */
  readonly maxContinuations: number;
  /** MCP server names to deploy into the container (from shared/mcp-servers/). */
  readonly mcpServers: readonly string[];
  /** Per-server env var overrides from profile config. Maps server name → env var name → value (static or $macro). */
  readonly mcpServerConfigs: Readonly<Record<string, Readonly<Record<string, string>>>>;
  /**
   * Control the bundled GitHub MCP server in Copilot CLI.
   * - `false` (default): server disabled (`--disable-builtin-mcps`)
   * - `["get_file_contents", ...]`: enable only the listed tools (`--add-github-mcp-tool`)
   */
  readonly githubMcpTools: false | readonly string[];
  readonly match: IProfileMatch;
  /** JIRA transition to execute before agent work. Empty = no transition. */
  readonly beforeAgent: IAgentTransition;
  /** JIRA transition to execute after agent work. Empty = no transition. */
  readonly afterAgent: IAgentTransition;
  /** Named preflight check to run before agent invocation. If it fails, the agent is not invoked. */
  readonly preflight?: string;
  /** JIRA comment posted when preflight fails. Falls back to a generic message. */
  readonly failureComment?: string;
  /** Skill folder names from shared/skills/ to deploy into the container. */
  readonly skills: readonly string[];
}

export interface IOutputConfig {
  readonly logDir: string;
  readonly handoffDir: string;
}

export interface ISecretsConfig {
  readonly ghToken: string;
  readonly adoPat: string;
  readonly adoPatXperience: string;
  /** Anthropic API key for Claude Code CLI. Optional — only needed when a profile uses `cli: "claude"`. */
  readonly anthropicApiKey: string;
  /** Discord bot token for the discord-hitl MCP server. Optional — only needed when a profile uses the discord-hitl MCP server. */
  readonly discordBotToken: string;
  /** Discord channel ID where HITL threads are created. Optional — paired with discordBotToken. */
  readonly discordChannelId: string;
}

export interface IDashboardConfig {
  readonly enabled: boolean;
  readonly url: string;
  readonly secret: string;
  readonly intervalMs: number;
}

/** Configuration for the prompt injection auditor. */
export interface IPromptAuditConfig {
  /** How the auditor handles findings: "block" rejects critical findings, "warn" logs only, "off" skips auditing. */
  readonly mode: AuditMode;
}

/** Configuration for the Ralphchives knowledge base infrastructure. */
export interface IRalphchivesConfig {
  readonly enabled: boolean;
  readonly nodebbApiUrl: string;
  readonly neo4jUri: string;
  readonly neo4jUser: string;
}

/** Readonly contract for the application configuration bag. All consumers depend on this interface. */
export interface IAppConfig {
  /** Named data source configurations (e.g. "kentico-jira" → JIRA instance). */
  readonly dataSources: Readonly<Record<string, IDataSourceConfig>>;
  readonly profiles: readonly IAgentProfile[];
  /** Plugin module specifiers — loaded before the DI container is created. */
  readonly plugins: readonly string[];
  readonly output: IOutputConfig;
  readonly dashboard: IDashboardConfig;
  readonly promptAudit: IPromptAuditConfig;
  readonly ralphchives: IRalphchivesConfig;
  /** Allow agents to retry via --continue when no result block is produced. Requires maxContinuations > 0 in the profile. */
  readonly enableContinuation: boolean;
  readonly secrets: ISecretsConfig;
}
