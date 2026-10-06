import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, resolve, relative } from "node:path";
import type { Plugin } from "vite";

/**
 * Vite plugin that serves agent graph data as JSON.
 *
 * Reads agent templates, includes, and skills from the filesystem and
 * computes the reference graph — the same data as `scripts/visualize-agent-graph.ts`
 * but served via HTTP for the dashboard UI.
 *
 * Endpoints:
 *   GET /api/agent-graph           → list of profiles + agents
 *   GET /api/agent-graph/:profile/:agent → graph for a specific agent
 */
export function agentGraphPlugin(): Plugin {
  const root = resolve(import.meta.dirname, "../..");
  const profilesDir = join(root, "profiles");
  const includesDir = join(root, "shared", "agent-includes");
  const skillsDir = join(root, "shared", "skills");

  return {
    name: "ralph-agent-graph",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = new URL(req.url ?? "/", "http://localhost");

        if (url.pathname === "/api/agent-graph") {
          const index = buildAgentIndex(profilesDir);
          sendJson(res, index);
        } else if (url.pathname.startsWith("/api/agent-graph/")) {
          const rest = decodeURIComponent(url.pathname.slice("/api/agent-graph/".length));
          const slashIdx = rest.indexOf("/");
          if (slashIdx === -1) {
            res.statusCode = 400;
            res.end("Bad request");
            return;
          }
          const profile = rest.slice(0, slashIdx);
          const agentName = rest.slice(slashIdx + 1);

          const agentFile = resolveAgent(profilesDir, profile, agentName);
          if (!agentFile) {
            res.statusCode = 404;
            res.end("Agent not found");
            return;
          }

          const skillCatalog = discoverSkills(skillsDir);
          const includeCatalog = discoverIncludes(includesDir);
          const graph = buildGraph(agentFile, profilesDir, skillCatalog, includeCatalog, skillsDir, includesDir);
          sendJson(res, graphToJson(graph));
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

interface AgentFile {
  profile: string;
  name: string;
  filePath: string;
  subAgents: string[];
}

interface NodeRef {
  type: "render" | "skill" | "sub-agent" | "conditional-render";
  target: string;
  condition?: string;
}

interface GraphNode {
  id: string;
  label: string;
  nodeType: "agent" | "sub-agent" | "include" | "skill";
  category?: string;
  refs: NodeRef[];
  profile?: string;
}

// ── Agent index ──────────────────────────────────────────────────

interface AgentIndexEntry {
  profile: string;
  agents: string[];
}

function buildAgentIndex(profilesDir: string): AgentIndexEntry[] {
  const result: AgentIndexEntry[] = [];
  for (const entry of readdirSync(profilesDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const agentsDir = join(profilesDir, entry.name, "agents");
    if (!existsSync(agentsDir)) continue;
    const agents = readdirSync(agentsDir)
      .filter((f) => f.endsWith(".agent.md"))
      .map((f) => f.replace(/\.agent\.md$/, ""));
    if (agents.length > 0) {
      result.push({ profile: entry.name, agents });
    }
  }
  return result;
}

function resolveAgent(profilesDir: string, profile: string, agentName: string): AgentFile | null {
  const filePath = join(profilesDir, profile, "agents", `${agentName}.agent.md`);
  if (!existsSync(filePath)) return null;
  const content = readFileSync(filePath, "utf-8");
  const subAgents: string[] = [];
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (fmMatch) {
    const agentsMatch = fmMatch[1].match(/agents:\s*\[([^\]]*)\]/);
    if (agentsMatch) {
      for (const m of agentsMatch[1].matchAll(/'([^']+)'|"([^"]+)"/g)) {
        subAgents.push(m[1] ?? m[2]);
      }
    }
  }
  return { profile, name: agentName, filePath, subAgents };
}

// ── Discovery ────────────────────────────────────────────────────

function discoverSkills(skillsDir: string): Map<string, string> {
  const skills = new Map<string, string>();
  function walk(dir: string) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (existsSync(join(full, "SKILL.md"))) {
          const category = relative(skillsDir, join(full, ".."));
          skills.set(entry.name, `${category}/${entry.name}`);
        }
        walk(full);
      }
    }
  }
  walk(skillsDir);
  return skills;
}

function discoverIncludes(includesDir: string): Map<string, string> {
  const includes = new Map<string, string>();
  function walk(dir: string) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".md")) {
        const rel = relative(includesDir, full).replace(/\.md$/, "");
        includes.set(rel, full);
      }
    }
  }
  walk(includesDir);
  return includes;
}

// ── Reference extraction ─────────────────────────────────────────

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractRefs(content: string, skillNames: string[]): NodeRef[] {
  const refs: NodeRef[] = [];
  const seen = new Set<string>();
  const lines = content.split("\n");
  let activeCondition: { label: string } | null = null;

  for (let i = 0; i < lines.length; i++) {
    const condOpen = lines[i].match(/\{%[-\s]*(?:if|unless)\s+(.*?)\s*[-]?%\}/);
    const condClose = /\{%[-\s]*(?:endif|endunless)\s*[-]?%\}/.test(lines[i]);
    const condElse = /\{%[-\s]*else\s*[-]?%\}/.test(lines[i]);
    if (condClose) activeCondition = null;
    if (condElse && activeCondition) {
      const label: string = activeCondition.label.startsWith("not ")
        ? activeCondition.label.slice(4)
        : `not ${activeCondition.label}`;
      activeCondition = { label };
    }
    if (condOpen) {
      const raw = condOpen[1].trim();
      const isUnless = /\{%[-\s]*unless/.test(lines[i]);
      activeCondition = { label: isUnless ? `not ${raw}` : raw };
    }

    const renderMatch = lines[i].match(/\{%[-\s]*render\s+'([^']+)'[^%]*%\}/);
    if (renderMatch) {
      const target = renderMatch[1];
      const key = `render:${target}`;
      if (!seen.has(key)) {
        seen.add(key);
        refs.push({
          type: activeCondition ? "conditional-render" : "render",
          target,
          condition: activeCondition?.label,
        });
      }
    }

    for (const skillName of skillNames) {
      const key = `skill:${skillName}`;
      if (seen.has(key)) continue;
      const esc = escapeRegex(skillName);
      const pattern = new RegExp(`(?:\\*\\*${esc}\\*\\*|\`${esc}\`|\\|\\s*${esc}\\s*\\||"${esc}")`);
      if (pattern.test(lines[i])) {
        seen.add(key);
        refs.push({ type: "skill", target: skillName, condition: activeCondition?.label });
      }
    }
  }

  return refs;
}

// ── Graph building ───────────────────────────────────────────────

function buildGraph(
  agent: AgentFile,
  profilesDir: string,
  skillCatalog: Map<string, string>,
  includeCatalog: Map<string, string>,
  skillsDir: string,
  includesDir: string,
): Map<string, GraphNode> {
  const graph = new Map<string, GraphNode>();
  const skillNames = [...skillCatalog.keys()];
  const queue: Array<{ id: string; filePath: string }> = [];

  // Agent node
  const agentId = `agent:${agent.profile}/${agent.name}`;
  const agentContent = readFileSync(agent.filePath, "utf-8");
  const agentRefs = extractRefs(agentContent, skillNames);
  for (const sub of agent.subAgents) {
    agentRefs.push({ type: "sub-agent", target: sub });
  }
  graph.set(agentId, { id: agentId, label: agent.name, nodeType: "agent", refs: agentRefs, profile: agent.profile });

  // Queue includes from agent
  for (const ref of agentRefs) {
    if (ref.type === "render" || ref.type === "conditional-render") {
      const p = includeCatalog.get(ref.target);
      if (p) queue.push({ id: `include:${ref.target}`, filePath: p });
    }
  }

  // Sub-agents
  for (const sub of agent.subAgents) {
    const subFile = join(profilesDir, agent.profile, "agents", `ralph.${sub}.agent.md`);
    if (existsSync(subFile)) {
      const subId = `sub-agent:${agent.profile}/${sub}`;
      const subRefs = extractRefs(readFileSync(subFile, "utf-8"), skillNames);
      graph.set(subId, { id: subId, label: sub, nodeType: "sub-agent", refs: subRefs, profile: agent.profile });
      for (const ref of subRefs) {
        if (ref.type === "render" || ref.type === "conditional-render") {
          const p = includeCatalog.get(ref.target);
          if (p) queue.push({ id: `include:${ref.target}`, filePath: p });
        }
      }
    }
  }

  // BFS includes
  const visited = new Set<string>();
  while (queue.length > 0) {
    const item = queue.shift()!;
    if (visited.has(item.id)) continue;
    visited.add(item.id);
    const content = readFileSync(item.filePath, "utf-8");
    const refs = extractRefs(content, skillNames);
    const relPath = relative(includesDir, item.filePath).replace(/\.md$/, "");
    graph.set(item.id, { id: item.id, label: relPath, nodeType: "include", refs });
    for (const ref of refs) {
      if (ref.type === "render" || ref.type === "conditional-render") {
        const p = includeCatalog.get(ref.target);
        if (p && !visited.has(`include:${ref.target}`)) {
          queue.push({ id: `include:${ref.target}`, filePath: p });
        }
      }
    }
  }

  // Skills (BFS with cross-references)
  const skillQueue: string[] = [];
  const visitedSkills = new Set<string>();
  for (const node of graph.values()) {
    for (const ref of node.refs) {
      if (ref.type === "skill" && !visitedSkills.has(ref.target)) {
        skillQueue.push(ref.target);
      }
    }
  }
  while (skillQueue.length > 0) {
    const name = skillQueue.shift()!;
    if (visitedSkills.has(name)) continue;
    visitedSkills.add(name);
    const relPath = skillCatalog.get(name);
    const category = relPath ? relPath.split("/")[0] : "unknown";
    let crossRefs: NodeRef[] = [];
    if (relPath) {
      const fp = join(skillsDir, relPath, "SKILL.md");
      if (existsSync(fp)) {
        crossRefs = extractRefs(readFileSync(fp, "utf-8"), skillNames).filter(
          (r) => r.type === "skill" && r.target !== name,
        );
        for (const cr of crossRefs) {
          if (!visitedSkills.has(cr.target)) skillQueue.push(cr.target);
        }
      }
    }
    graph.set(`skill:${name}`, { id: `skill:${name}`, label: name, nodeType: "skill", category, refs: crossRefs });
  }

  return graph;
}

// ── JSON serialization ───────────────────────────────────────────

/** Flat node representation for the frontend. */
export interface GraphNodeJson {
  id: string;
  label: string;
  nodeType: "agent" | "sub-agent" | "include" | "skill";
  category?: string;
  refs: Array<{
    type: "render" | "skill" | "sub-agent" | "conditional-render";
    targetId: string;
    condition?: string;
  }>;
}

function graphToJson(graph: Map<string, GraphNode>): GraphNodeJson[] {
  return [...graph.values()].map((node) => ({
    id: node.id,
    label: node.label,
    nodeType: node.nodeType,
    category: node.category,
    refs: node.refs
      .map((ref) => {
        let targetId: string;
        switch (ref.type) {
          case "sub-agent":
            targetId = `sub-agent:${node.profile}/${ref.target}`;
            break;
          case "render":
          case "conditional-render":
            targetId = `include:${ref.target}`;
            break;
          case "skill":
            targetId = `skill:${ref.target}`;
            break;
        }
        return graph.has(targetId) ? { type: ref.type, targetId, condition: ref.condition } : null;
      })
      .filter((r): r is NonNullable<typeof r> => r !== null),
  }));
}
