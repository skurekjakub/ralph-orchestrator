import { readFileSync } from "node:fs";
import { toErrorMessage } from "../util/error";
import { profileFileSchema, type ProfileFile, type StageFile } from "./schemas";
import { type CliType, type IAgentProfile, type IStageConfig, StageMode, VcsProvider } from "./types";

/** One `mcpServers` list normalised into server names, per-server `env` and merged `sidecarEnv`. */
interface McpServerSet {
  readonly names: readonly string[];
  readonly configs: Readonly<Record<string, Readonly<Record<string, string>>>>;
  readonly sidecarEnv: Readonly<Record<string, string>>;
}

/** Normalises a mixed string/object `mcpServers` list; entries with an empty `env` contribute no config. */
function normalizeMcpServers(entries: ProfileFile["mcpServers"]): McpServerSet {
  const names: string[] = [];
  const configs: Record<string, Record<string, string>> = {};
  const sidecarEnv: Record<string, string> = {};
  for (const entry of entries) {
    if (typeof entry === "string") {
      names.push(entry);
      continue;
    }
    names.push(entry.name);
    if (entry.env && Object.keys(entry.env).length > 0) {
      configs[entry.name] = entry.env;
    }
    if (entry.sidecarEnv) {
      Object.assign(sidecarEnv, entry.sidecarEnv);
    }
  }
  return { names, configs, sidecarEnv };
}

/** Resolves one profile.json stage against the profile's default CLI. */
function resolveStage(stage: StageFile, profileCli: CliType, requireResultBlockByDefault: boolean): IStageConfig {
  return {
    agent: stage.agent,
    role: stage.role,
    mode: stage.mode,
    cli: stage.cli ?? profileCli,
    skills: stage.skills,
    model: stage.model,
    effort: stage.effort,
    requireResultBlock: stage.requireResultBlock ?? requireResultBlockByDefault,
    timeoutMs: stage.timeoutMs,
  };
}

/**
 * Reads and schema-validates one `profiles/<id>/profile.json`.
 *
 * @throws Error when the file is unreadable or not JSON; ZodError when it breaks the profile schema.
 */
export function readProfileFile(profileJsonPath: string): ProfileFile {
  let rawJson: unknown;
  try {
    rawJson = JSON.parse(readFileSync(profileJsonPath, "utf-8"));
  } catch (err) {
    throw new Error(`Failed to read ${profileJsonPath}: ${toErrorMessage(err)}`);
  }
  return profileFileSchema.parse(rawJson);
}

/**
 * Expands one parsed profile.json into one {@link IAgentProfile} per variant, in variant order.
 *
 * A variant's MCP servers are the profile-level servers followed by its own; a variant entry's `env`
 * replaces the profile entry's `env` for the same server. Each stage runs its own `cli`, else the
 * profile `cli`. Variant stages require a result unless they opt out; post-task hook stages
 * don't unless they opt in.
 *
 * @param profileId The profile's directory name under `profiles/`.
 * @throws Error when the profile-level `mcpServers` list names a server more than once.
 */
export function resolveProfileVariants(parsed: ProfileFile, profileId: string): IAgentProfile[] {
  const profileServers = normalizeMcpServers(parsed.mcpServers);
  const duplicates = profileServers.names.filter((name, i) => profileServers.names.indexOf(name) !== i);
  if (duplicates.length > 0) {
    throw new Error(`Profile "${profileId}": duplicate MCP server(s): ${[...new Set(duplicates)].join(", ")}`);
  }

  const repoPat = parsed.repoPat ?? (parsed.vcsProvider === VcsProvider.GitHub ? "GH_TOKEN" : "ADO_PAT");

  return parsed.variants.map((variant) => {
    const variantServers = normalizeMcpServers(variant.mcpServers);
    const stages = variant.stages.map((s) => resolveStage(s, parsed.cli, true));
    const postTaskHooks = variant.postTaskHooks.map((hook) => ({
      name: hook.name,
      stages: hook.stages.map((s) => resolveStage(s, parsed.cli, false)),
    }));
    const containerClis = [...new Set(stages.filter((s) => s.mode === StageMode.Container).map((s) => s.cli))];
    const firstAgent = stages[0].agent;

    return {
      id: profileId,
      dataSource: parsed.dataSource,
      repoUrl: parsed.repoUrl,
      vcsProvider: parsed.vcsProvider,
      repoPat,
      composeFile: `profiles/${profileId}/docker-compose.yml`,
      agentName: firstAgent,
      displayName: firstAgent.replace(/^ralph\./, ""),
      variantKey: `${profileId}:${firstAgent}:${variant.match.commentTrigger}`,
      cli: parsed.cli,
      containerClis,
      model: variant.model ?? parsed.model,
      timeoutMs: parsed.timeoutMs,
      setupScript: parsed.setupScript,
      auditLogPath: parsed.auditLogPath,
      composeProjectLabel: parsed.composeProjectLabel,
      cleanPaths: parsed.cleanPaths,
      maxContinuations: parsed.maxContinuations,
      mcpServers: [...new Set([...profileServers.names, ...variantServers.names])],
      mcpServerConfigs: { ...profileServers.configs, ...variantServers.configs },
      mcpSidecarEnv: { ...profileServers.sidecarEnv, ...variantServers.sidecarEnv },
      githubMcpTools: parsed.githubMcpTools,
      claude: { loadRepoInstructions: parsed.claude.loadRepoInstructions },
      allowlistDomains: parsed.allowlistDomains,
      resources: parsed.resources,
      match: {
        projects: variant.match.projects,
        statuses: variant.match.statuses,
        commentTrigger: variant.match.commentTrigger,
        revisionStatuses: variant.match.revisionStatuses,
      },
      beforeAgent: variant.beforeAgent,
      afterAgent: variant.afterAgent,
      preflight: variant.preflight,
      failureComment: variant.failureComment,
      description: variant.description,
      skills: [...new Set(stages.flatMap((s) => s.skills))],
      stages,
      postTaskHooks,
    };
  });
}
