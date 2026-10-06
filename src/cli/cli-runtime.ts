import type { CliType } from "../config/types.js";
import type { ICliCredentialPolicy } from "./credential-catalog.js";
import type { ICliModelPolicy } from "./model-catalog.js";

/** Whether a CLI writes its debug log to one file or to files inside a directory. */
export enum CliDebugLogKind {
  File = "file",
  Dir = "dir",
}

/** Filesystem layout of one CLI inside the agent container. All paths are absolute container paths. */
export interface CliContainerLayout {
  /** CLI home directory (Copilot `--config-dir`, Claude Code `CLAUDE_CONFIG_DIR`). */
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
