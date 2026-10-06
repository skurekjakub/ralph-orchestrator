import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import type { Plugin } from "vite";

/**
 * Vite plugin that discovers multi-agent fractal families and extracts
 * dispatch edges, artifact production/consumption, and pass pipeline data.
 *
 * Endpoints:
 *   GET /api/fractal-families                → list of detected families
 *   GET /api/fractal-graph/:dir/:family      → full graph for a family
 */
export function fractalGraphPlugin(): Plugin {
  const root = resolve(import.meta.dirname, "../..");

  return {
    name: "ralph-fractal-graph",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = new URL(req.url ?? "/", "http://localhost");

        if (url.pathname === "/api/fractal-families") {
          const families = discoverFamilies(root);
          sendJson(res, families);
        } else if (url.pathname.startsWith("/api/fractal-graph/")) {
          const rest = decodeURIComponent(url.pathname.slice("/api/fractal-graph/".length));
          const slashIdx = rest.lastIndexOf("/");
          if (slashIdx === -1) {
            res.statusCode = 400;
            res.end("Bad request");
            return;
          }
          const dir = rest.slice(0, slashIdx);
          const family = rest.slice(slashIdx + 1);
          const graph = buildFractalGraph(root, dir, family);
          if (!graph) {
            res.statusCode = 404;
            res.end("Family not found");
            return;
          }
          sendJson(res, graph);
        } else {
          next();
        }
      });
    },
  };
}

function sendJson(res: import("node:http").ServerResponse, data: unknown) {
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(data));
}

// ── Types ────────────────────────────────────────────────────────

export interface FractalFamily {
  name: string;
  dir: string;
  agentCount: number;
  rootAgent: string;
}

export interface FractalNode {
  id: string;
  label: string;
  shortLabel: string;
  role: "orchestrator" | "coordinator" | "specialist";
  pass?: string;
  passNumber?: number;
}

export interface FractalEdge {
  source: string;
  target: string;
  type: "dispatch" | "artifact-write" | "artifact-read";
  label?: string;
}

export interface ArtifactNode {
  id: string;
  label: string;
  path: string;
}

export interface PipelinePass {
  number: number;
  label: string;
  agents: string[];
  conditions: string[];
  resultValues: string[];
}

export interface FractalGraphData {
  family: string;
  agents: FractalNode[];
  artifacts: ArtifactNode[];
  edges: FractalEdge[];
  pipeline: PipelinePass[];
}

// ── Family discovery ─────────────────────────────────────────────

function discoverFamilies(root: string): FractalFamily[] {
  const families: FractalFamily[] = [];
  const searchDirs = [{ dir: ".github/agents", abs: join(root, ".github", "agents") }];

  const profilesDir = join(root, "profiles");
  if (existsSync(profilesDir)) {
    for (const entry of readdirSync(profilesDir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        const agentsDir = join(profilesDir, entry.name, "agents");
        if (existsSync(agentsDir)) {
          searchDirs.push({ dir: `profiles/${entry.name}/agents`, abs: agentsDir });
        }
      }
    }
  }

  for (const { dir, abs } of searchDirs) {
    if (!existsSync(abs)) continue;
    const agentFiles = readdirSync(abs).filter((f) => f.endsWith(".agent.md"));
    if (agentFiles.length < 3) continue;

    const names = agentFiles.map((f) => f.replace(/\.agent\.md$/, ""));
    const prefixGroups = new Map<string, string[]>();

    for (const name of names) {
      const children = names.filter((n) => n !== name && n.startsWith(name + "-"));
      if (children.length >= 2) {
        prefixGroups.set(name, [name, ...children]);
      }
    }

    const claimed = new Set<string>();
    const sorted = [...prefixGroups.entries()].sort((a, b) => b[1].length - a[1].length);
    for (const [prefix, members] of sorted) {
      if (claimed.has(prefix)) continue;
      let isChild = false;
      for (const [otherPrefix] of sorted) {
        if (otherPrefix !== prefix && prefix.startsWith(otherPrefix + "-")) {
          isChild = true;
          break;
        }
      }
      if (isChild) continue;

      for (const m of members) claimed.add(m);
      families.push({
        name: prefix,
        dir,
        agentCount: members.length,
        rootAgent: prefix,
      });
    }
  }

  return families;
}

// ── Graph building ───────────────────────────────────────────────

function buildFractalGraph(root: string, dir: string, familyName: string): FractalGraphData | null {
  const absDir = join(root, dir);
  if (!existsSync(absDir)) return null;

  const agentFiles = readdirSync(absDir).filter((f) => f.endsWith(".agent.md"));
  const familyFiles = agentFiles.filter((f) => {
    const name = f.replace(/\.agent\.md$/, "");
    return name === familyName || name.startsWith(familyName + "-");
  });

  if (familyFiles.length === 0) return null;

  const familyNames = new Set(familyFiles.map((f) => f.replace(/\.agent\.md$/, "")));
  const agentMap = new Map<string, FractalNode>();
  const artifacts = new Map<string, ArtifactNode>();
  const edges: FractalEdge[] = [];
  const pipelinePasses = new Map<number, PipelinePass>();
  const edgeDedup = new Set<string>();
  const dispatchMap = new Map<string, string[]>(); // source → targets

  function addEdge(e: FractalEdge) {
    const key = `${e.source}|${e.target}|${e.type}`;
    if (edgeDedup.has(key)) return;
    edgeDedup.add(key);
    edges.push(e);
  }

  // First pass: parse all agents
  for (const file of familyFiles) {
    const name = file.replace(/\.agent\.md$/, "");
    const filePath = join(absDir, file);
    const content = readFileSync(filePath, "utf-8");

    const role = classifyRole(name, familyName);
    const passInfo = extractPass(content, name, familyName);

    agentMap.set(name, {
      id: name,
      label: name,
      shortLabel: name === familyName ? "orchestrator" : name.replace(familyName + "-", ""),
      role,
      pass: passInfo?.label,
      passNumber: passInfo?.number,
    });

    // Dispatch edges
    const dispatches = extractDispatches(content, familyNames);
    dispatchMap.set(name, dispatches);
    for (const target of dispatches) {
      addEdge({ source: name, target, type: "dispatch" });
    }

    // Artifact writes
    for (const w of extractArtifactWrites(content, familyName)) {
      const artId = `artifact:${w}`;
      if (!artifacts.has(artId)) {
        artifacts.set(artId, { id: artId, label: artifactShortLabel(w), path: w });
      }
      addEdge({ source: name, target: artId, type: "artifact-write" });
    }

    // Artifact reads
    for (const r of extractArtifactReads(content, familyName)) {
      const artId = `artifact:${r}`;
      if (!artifacts.has(artId)) {
        artifacts.set(artId, { id: artId, label: artifactShortLabel(r), path: r });
      }
      addEdge({ source: artId, target: name, type: "artifact-read" });
    }
  }

  // Second pass: inherit pass numbers from dispatchers for unassigned agents
  for (const [source, targets] of dispatchMap) {
    const sourceAgent = agentMap.get(source);
    if (!sourceAgent || sourceAgent.passNumber === undefined) continue;
    for (const targetId of targets) {
      const targetAgent = agentMap.get(targetId);
      if (targetAgent && (targetAgent.passNumber === undefined || targetAgent.passNumber === 9990)) {
        targetAgent.passNumber = sourceAgent.passNumber;
        targetAgent.pass = sourceAgent.pass;
      }
    }
  }

  // Build pipeline passes
  for (const agent of agentMap.values()) {
    const resultValues = extractResultValuesForAgent(join(absDir, `${agent.id}.agent.md`));
    const passNum = agent.passNumber ?? 9990;
    if (!pipelinePasses.has(passNum)) {
      pipelinePasses.set(passNum, {
        number: passNum,
        label: agent.pass ?? agent.shortLabel,
        agents: [],
        conditions: [],
        resultValues: [],
      });
    }
    const p = pipelinePasses.get(passNum)!;
    p.agents.push(agent.id);
    for (const rv of resultValues) {
      if (!p.resultValues.includes(rv)) p.resultValues.push(rv);
    }
  }

  // Extract pipeline conditions from orchestrator routing table
  const orchestratorFile = join(absDir, `${familyName}.agent.md`);
  if (existsSync(orchestratorFile)) {
    const content = readFileSync(orchestratorFile, "utf-8");
    extractPipelineConditions(content, pipelinePasses);
  }

  return {
    family: familyName,
    agents: [...agentMap.values()],
    artifacts: [...artifacts.values()],
    edges,
    pipeline: [...pipelinePasses.values()].sort((a, b) => a.number - b.number),
  };
}

// ── Extraction helpers ───────────────────────────────────────────

function classifyRole(name: string, family: string): "orchestrator" | "coordinator" | "specialist" {
  if (name === family) return "orchestrator";
  if (name.includes("-coordinator")) return "coordinator";
  return "specialist";
}

function extractPass(content: string, name: string, family: string): { number: number; label: string } | undefined {
  if (name === family) return { number: -1, label: "Orchestrator" };

  // Look for passN_name keys (e.g. pass1_discovery)
  const passKeyMatch = content.match(/pass(\d+(?:5)?)_(\w+)/);
  if (passKeyMatch) {
    const rawNum = passKeyMatch[1];
    // "65" → 6.5, "1" → 1
    const num = rawNum.length > 1 && rawNum.endsWith("5") ? parseInt(rawNum.slice(0, -1)) + 0.5 : parseInt(rawNum);
    const suffix = name.replace(family + "-", "");
    return { number: num * 10, label: `Pass ${num}: ${suffix}` };
  }

  // Fallback: "Pass N" in text
  const passTextMatch = content.match(/Pass\s+(\d+(?:\.\d+)?)/);
  if (passTextMatch) {
    const num = parseFloat(passTextMatch[1]);
    const suffix = name.replace(family + "-", "");
    return { number: num * 10, label: `Pass ${passTextMatch[1]}: ${suffix}` };
  }

  const suffix = name.replace(family + "-", "");
  return { number: 9990, label: suffix };
}

function extractDispatches(content: string, familyNames: Set<string>): string[] {
  const dispatches: string[] = [];
  const seen = new Set<string>();

  // `@agentname` — primary dispatch pattern
  const atPattern = /`@([\w-]+)`/g;
  let m;
  while ((m = atPattern.exec(content)) !== null) {
    const target = m[1];
    if (familyNames.has(target) && !seen.has(target)) {
      seen.add(target);
      dispatches.push(target);
    }
  }

  // Bare @agentname references (but not in code blocks)
  const barePattern = /(?:^|\s)@([\w-]+)/gm;
  while ((m = barePattern.exec(content)) !== null) {
    const target = m[1];
    if (familyNames.has(target) && !seen.has(target)) {
      seen.add(target);
      dispatches.push(target);
    }
  }

  return dispatches;
}

/** Artifact path prefix for any family (e.g. ".docwriter/" or ".migration/") */
function artifactPrefix(familyName: string): string {
  return `.${familyName}/`;
}

function extractArtifactWrites(content: string, familyName: string): string[] {
  const writes: string[] = [];
  const seen = new Set<string>();
  const prefix = artifactPrefix(familyName);

  // "Write `path`" / "Write to `path`:" / "Prepend to `path`" / "Update `path`"
  const writePatterns = [
    /[Ww]rite\s+(?:to\s+)?`([^`]+)`/g,
    /[Pp]repend\s+(?:to\s+)?`([^`]+)`/g,
    /[Uu]pdate\s+`([^`]+\.json)`/g,
    /[Cc]reate\s+`([^`]+)`/g,
  ];

  for (const pattern of writePatterns) {
    let m;
    while ((m = pattern.exec(content)) !== null) {
      const path = m[1];
      if (isArtifactPath(path, prefix) && !seen.has(path)) {
        seen.add(path);
        writes.push(path);
      }
    }
  }

  return writes;
}

function extractArtifactReads(content: string, familyName: string): string[] {
  const reads: string[] = [];
  const seen = new Set<string>();
  const prefix = artifactPrefix(familyName);

  // "Read `path`" / inline in Inputs sections / "- `path` —"
  const readPatterns = [
    /[Rr]ead\s+(?:from\s+)?`([^`]+\.(?:json|md))`/g,
    /- `([^`]+\.(?:json|md))` —/g,
    /- `([^`]+\.(?:json|md))`\s*(?:$|\()/gm,
    /Wait for (?:status file: )?`([^`]+\.json)`/g,
    /[Vv]erify[^`]*`([^`]+\.json)`/g,
    /[Cc]heck[^`]*`([^`]+\.json)`/g,
  ];

  for (const pattern of readPatterns) {
    let m;
    while ((m = pattern.exec(content)) !== null) {
      const path = m[1];
      if (isArtifactPath(path, prefix) && !seen.has(path)) {
        seen.add(path);
        reads.push(path);
      }
    }
  }

  return reads;
}

function isArtifactPath(path: string, prefix: string): boolean {
  if (path.startsWith(prefix)) return true;
  if (path.startsWith(".github/skills/")) return true;
  if (path.includes("<") || path.includes("FILL")) return false;
  return false;
}

function artifactShortLabel(path: string): string {
  const parts = path.split("/");
  if (parts.length > 2) return parts.slice(-2).join("/");
  return parts[parts.length - 1];
}

function extractResultValues(content: string): string[] {
  const values: string[] = [];
  const seen = new Set<string>();
  const resultPattern = /"result":\s*"([^"]+)"/g;
  let m;
  while ((m = resultPattern.exec(content)) !== null) {
    if (!seen.has(m[1])) {
      seen.add(m[1]);
      values.push(m[1]);
    }
  }
  return values;
}

function extractResultValuesForAgent(filePath: string): string[] {
  if (!existsSync(filePath)) return [];
  return extractResultValues(readFileSync(filePath, "utf-8"));
}

function extractPipelineConditions(content: string, passes: Map<number, PipelinePass>): void {
  // Extract routing table conditions: `passN_name` not done → dispatch
  const condPattern = /`(pass\d+(?:5)?_\w+)`\s+(.*?)\s*\|/g;
  let m;
  while ((m = condPattern.exec(content)) !== null) {
    const passKey = m[1];
    const condition = m[2].trim();
    const rawNum = passKey.match(/pass(\d+(?:5)?)/)?.[1];
    if (!rawNum) continue;
    const num =
      rawNum.length > 1 && rawNum.endsWith("5") ? (parseInt(rawNum.slice(0, -1)) + 0.5) * 10 : parseInt(rawNum) * 10;
    const pass = passes.get(num);
    if (pass && condition && !pass.conditions.includes(condition)) {
      pass.conditions.push(condition);
    }
  }
}
