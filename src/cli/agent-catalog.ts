import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { AgentDefinitionError, agentFileIdOf, type AgentSource, parseAgentSource } from "./agent-definition";
import type { AgentGraph } from "./agent-file-writer";

/** Every agent template of one directory: the ones that parse, and the error of each one that does not. */
export interface AgentSourceScan {
  /** File ids of every `*.agent.md`, sorted. */
  readonly fileIds: readonly string[];
  /** The templates that parse, in file id order. */
  readonly sources: readonly AgentSource[];
  /** One error per template whose frontmatter is invalid, in file id order. */
  readonly errors: readonly AgentDefinitionError[];
}

/**
 * Reads and parses every `*.agent.md` template in `agentsDir`, collecting each invalid template's error
 * instead of stopping at the first.
 *
 * @throws Error when the directory or a template file cannot be read.
 */
export async function scanAgentSources(agentsDir: string): Promise<AgentSourceScan> {
  const fileIds: string[] = [];
  const sources: AgentSource[] = [];
  const errors: AgentDefinitionError[] = [];
  for (const fileName of (await readdir(agentsDir)).sort()) {
    const fileId = agentFileIdOf(fileName);
    if (fileId === null) continue;
    fileIds.push(fileId);
    try {
      sources.push(parseAgentSource(fileId, await readFile(join(agentsDir, fileName), "utf-8")));
    } catch (err) {
      if (!(err instanceof AgentDefinitionError)) throw err;
      errors.push(err);
    }
  }
  return { fileIds, sources, errors };
}

/**
 * Structural problems of one profile's agent set: names used twice, `subagents` naming no agent of
 * the profile, and subagent cycles.
 *
 * @returns One message per problem; empty when the set forms a valid agent graph.
 */
export function findAgentCatalogIssues(sources: readonly AgentSource[]): string[] {
  const issues: string[] = [];
  const byName = new Map<string, AgentSource>();

  for (const source of sources) {
    const { name } = source.frontmatter;
    const existing = byName.get(name);
    if (existing) {
      issues.push(`agents ${existing.fileId} and ${source.fileId} share the name "${name}"`);
      continue;
    }
    byName.set(name, source);
  }

  for (const source of sources) {
    for (const subagent of source.frontmatter.subagents) {
      if (!byName.has(subagent)) {
        issues.push(`agent ${source.fileId}: subagent "${subagent}" is not an agent of this profile`);
      }
    }
  }

  const visiting = new Set<string>();
  const done = new Set<string>();
  const reported = new Set<string>();
  const visit = (name: string, path: readonly string[]): void => {
    if (done.has(name)) return;
    if (visiting.has(name)) {
      const cycle = [...path.slice(path.indexOf(name)), name];
      const key = [...cycle].sort().join(",");
      if (!reported.has(key)) {
        reported.add(key);
        issues.push(`subagent cycle: ${cycle.join(" → ")}`);
      }
      return;
    }
    visiting.add(name);
    for (const subagent of byName.get(name)?.frontmatter.subagents ?? []) {
      if (byName.has(subagent)) visit(subagent, [...path, name]);
    }
    visiting.delete(name);
    done.add(name);
  };
  for (const name of byName.keys()) visit(name, []);

  return issues;
}

/**
 * The parsed agent templates of one profile, indexed by file id and by name, with the subagent
 * graph between them. Construction guarantees a valid graph: unique names, resolvable subagents and
 * no cycles.
 */
export class AgentCatalog implements AgentGraph {
  private readonly byFileId = new Map<string, AgentSource>();
  private readonly byName = new Map<string, AgentSource>();

  /** @throws Error listing every problem {@link findAgentCatalogIssues} finds. */
  constructor(sources: readonly AgentSource[]) {
    const issues = findAgentCatalogIssues(sources);
    if (issues.length > 0) {
      throw new Error(`Invalid agent set:\n  ${issues.join("\n  ")}`);
    }
    for (const source of sources) {
      this.byFileId.set(source.fileId, source);
      this.byName.set(source.frontmatter.name, source);
    }
  }

  /**
   * Reads and parses every `*.agent.md` template in `agentsDir`.
   *
   * @throws AgentDefinitionError for the first template whose frontmatter is invalid; Error when the
   *   directory is unreadable or the templates do not form a valid agent graph.
   */
  static async load(agentsDir: string): Promise<AgentCatalog> {
    const { sources, errors } = await scanAgentSources(agentsDir);
    if (errors.length > 0) throw errors[0];
    return new AgentCatalog(sources);
  }

  /** File ids of every agent, sorted. */
  get fileIds(): readonly string[] {
    return [...this.byFileId.keys()].sort();
  }

  /**
   * The agent with file id `fileId`.
   *
   * @throws Error when the profile has no such agent.
   */
  get(fileId: string): AgentSource {
    const source = this.byFileId.get(fileId);
    if (!source) {
      throw new Error(`No agent template ${fileId} (agents: ${this.fileIds.join(", ")})`);
    }
    return source;
  }

  /** The agent named `name`, or undefined. */
  findByName(name: string): AgentSource | undefined {
    return this.byName.get(name);
  }

  reachableFrom(rootFileId: string): readonly string[] {
    const seen = new Set<string>();
    const order: string[] = [];
    const queue = [this.get(rootFileId)];
    while (queue.length > 0) {
      const source = queue.shift()!;
      if (seen.has(source.fileId)) continue;
      seen.add(source.fileId);
      order.push(source.fileId);
      for (const name of source.frontmatter.subagents) queue.push(this.byName.get(name)!);
    }
    return order;
  }

  depthFrom(rootFileId: string): number {
    const depth = (source: AgentSource): number =>
      Math.max(0, ...source.frontmatter.subagents.map((name) => 1 + depth(this.byName.get(name)!)));
    return depth(this.get(rootFileId));
  }
}
