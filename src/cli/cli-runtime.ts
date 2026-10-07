import type { CliType, IAgentProfile } from "../config/types";
import type { FolderExportDef, LogSourceDef } from "../container/log-collector";
import type { ProfileBuildPaths } from "../container/setup/build-paths";
import type { Logger } from "../logger";
import type { AgentGraph, IAgentFileWriter } from "./agent-file-writer";
import type { CliToolNames } from "./cli-tools";
import type { ICliCredentialPolicy } from "./credential-catalog";
import type { ICliModelPolicy } from "./model-catalog";
import type { ICliOutputDecoder } from "./output-decoder";

/** Whether a CLI writes its debug log to one file or to files inside a directory. */
export enum CliDebugLogKind {
  File = "file",
  Dir = "dir",
}

/** Filesystem layout of one CLI inside the agent container. All paths are absolute container paths. */
export interface CliContainerLayout {
  /**
   * The CLI binary, installed root-owned in the agent images and run by absolute path so a user-level
   * npm install that lands earlier on `PATH` cannot stand in for it.
   */
  readonly binary: string;
  /** CLI home directory (Copilot `COPILOT_HOME`, Claude Code `CLAUDE_CONFIG_DIR`). */
  readonly configDir: string;
  /** Directories that must exist and be writable by the `vscode` user before the CLI starts. */
  readonly writableDirs: readonly string[];
  /** Directory the CLI discovers rendered agent files in. */
  readonly agentsDir: string;
  /** Directory the CLI discovers skills in, one sub-directory per skill. */
  readonly skillsDir: string;
  /** The CLI's debug log. */
  readonly debugLog: { readonly kind: CliDebugLogKind; readonly path: string };
  /** Markdown transcript the CLI writes itself, or null when the transcript is derived on the host. */
  readonly transcriptPath: string | null;
}

/** The task a CLI's container contribution and per-task artifacts are generated for. */
export interface CliTaskInput {
  /** The matched variant; `skills` is the union of its stages' skills. */
  readonly profile: IAgentProfile;
  /** Host paths of the profile's sources and generated artifacts. */
  readonly paths: ProfileBuildPaths;
  /** The profile's subagent graph, for the agents each container stage can reach. */
  readonly agents: AgentGraph;
}

/** What one CLI adds to the agent container's `app` service. */
export interface ComposeContribution {
  /** Bind mounts in compose short syntax (`<host path>:<container path>[:ro]`). */
  readonly volumes: readonly string[];
  /** Environment entries; a value may be a compose interpolation such as `${GH_TOKEN}`. */
  readonly env: Readonly<Record<string, string>>;
}

/** Several CLIs' contributions as one: each volume listed once, in order, and the environment entries of all of them (the CLIs set disjoint variables). */
export function mergeComposeContributions(contributions: readonly ComposeContribution[]): ComposeContribution {
  return {
    volumes: [...new Set(contributions.flatMap((c) => c.volumes))],
    env: Object.assign({}, ...contributions.map((c) => c.env)),
  };
}

/** Log files and folders one CLI writes inside the agent container. */
export interface CliLogSources {
  readonly sources: readonly LogSourceDef[];
  readonly exports: readonly FolderExportDef[];
}

/** What the orchestrator needs to know to run one agent CLI. One implementation per supported CLI. */
export interface ICliRuntime {
  /** The CLI this runtime describes. */
  readonly cli: CliType;
  /** Where the CLI keeps its home, agents, skills, logs and transcript inside the agent container. */
  readonly layout: CliContainerLayout;
  /** Model references the CLI accepts and how canonical models map to them. */
  readonly models: ICliModelPolicy;
  /** Environment variables the CLI authenticates with. */
  readonly credentials: ICliCredentialPolicy;
  /** Serialises the profile's canonical agents into the CLI's agent file format. */
  readonly agentWriter: IAgentFileWriter;
  /** What the CLI calls the tools agent templates and skills name in prose (`{{ cliTools.subagent }}`). */
  readonly toolNames: CliToolNames;
  /**
   * Whether the container sees each rendered agent file and skill directory through its own bind mount,
   * fixed at compose up, rather than the build directories whole. Every item such a mount names must then
   * exist before the containers start and stay in place while they run.
   */
  readonly mountsEachRenderedItem: boolean;
  /** Domains the CLI itself reaches (its model API), added to the task's Squid allowlist. */
  readonly egressDomains: readonly string[];
  /**
   * Paths relative to `/workspace` that the CLI's mounts create inside the target repo; a trailing `/` marks a
   * directory. Those outside `.ralph/` go into the target repo's git exclude.
   */
  readonly workspaceMountTargets: readonly string[];
  /** Mounts and environment the CLI adds to the `app` service for one task. */
  composeContribution(input: CliTaskInput): ComposeContribution;
  /**
   * Writes the CLI's per-task artifacts into the profile's build directory before the containers start.
   *
   * @throws Error when an input the artifacts are built from is missing or malformed.
   */
  writeTaskArtifacts(input: CliTaskInput, logger: Logger): void;
  /**
   * Log files and folders to collect from the container.
   *
   * @param onDebugLine Receives each line of the CLI's debug log while it streams; the debug log is only collected without it.
   */
  logSources(onDebugLine?: (line: string) => void): CliLogSources;
  /** A fresh decoder for the stdout of one CLI process. */
  createOutputDecoder(): ICliOutputDecoder;
}

/** Resolves the runtime of a CLI. */
export interface ICliRuntimeRegistry {
  /**
   * The runtime of `cli`.
   *
   * @throws Error when no runtime is registered for `cli`.
   */
  get(cli: CliType): ICliRuntime;
  /**
   * The runtimes of `clis`, each once, in registration order.
   *
   * @throws Error when one of `clis` has no registered runtime.
   */
  forClis(clis: Iterable<CliType>): readonly ICliRuntime[];
}

/** Registry over a fixed set of CLI runtimes, built once in the composition root. */
export class CliRuntimeRegistry implements ICliRuntimeRegistry {
  private readonly runtimes: readonly ICliRuntime[];

  /** @throws Error when two runtimes describe the same CLI. */
  constructor({ runtimes }: { runtimes: readonly ICliRuntime[] }) {
    const seen = new Set<CliType>();
    for (const runtime of runtimes) {
      if (seen.has(runtime.cli)) {
        throw new Error(`Two CLI runtimes registered for cli "${runtime.cli}"`);
      }
      seen.add(runtime.cli);
    }
    this.runtimes = runtimes;
  }

  get(cli: CliType): ICliRuntime {
    const runtime = this.runtimes.find((r) => r.cli === cli);
    if (!runtime) {
      throw new Error(`No CLI runtime registered for cli "${cli}"`);
    }
    return runtime;
  }

  forClis(clis: Iterable<CliType>): readonly ICliRuntime[] {
    const wanted = new Set(clis);
    for (const cli of wanted) this.get(cli);
    return this.runtimes.filter((r) => wanted.has(r.cli));
  }
}
