#!/usr/bin/env npx tsx
/**
 * Visualizes the reference graph from agent files → includes → skills.
 *
 * Usage:
 *   npx tsx scripts/visualize-agent-graph.ts [--profile <id>] [--agent <name>] [--mermaid]
 *
 * Options:
 *   --profile <id>   Show only agents from a specific profile (e.g. ralph-docs)
 *   --agent <name>   Show graph for a single agent file (partial match on filename)
 *   --mermaid        Output Mermaid flowchart syntax instead of ASCII tree
 *
 * Examples:
 *   npx tsx scripts/visualize-agent-graph.ts
 *   npx tsx scripts/visualize-agent-graph.ts --profile ralph-docs
 *   npx tsx scripts/visualize-agent-graph.ts --agent ralph.ralph
 *   npx tsx scripts/visualize-agent-graph.ts --profile ralph-docs --mermaid
 */

import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const PROFILES_DIR = path.join(ROOT, "profiles");
const INCLUDES_DIR = path.join(ROOT, "shared", "agent-includes");
const SKILLS_DIR = path.join(ROOT, "shared", "skills");

// ── Argument parsing ──────────────────────────────────────────────

const args = process.argv.slice(2);
function getArg(name: string): string | undefined {
  const idx = args.indexOf(`--${name}`);
  return idx !== -1 && idx + 1 < args.length ? args[idx + 1] : undefined;
}
const filterProfile = getArg("profile");
const filterAgent = getArg("agent");
const mermaidMode = args.includes("--mermaid");

// ── Skill catalog ────────────────────────────────────────────────

function discoverSkills(): Map<string, string> {
  const skills = new Map<string, string>();
  function walk(dir: string) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        const skillFile = path.join(full, "SKILL.md");
        if (fs.existsSync(skillFile)) {
          const category = path.relative(SKILLS_DIR, path.dirname(full));
          skills.set(entry.name, `skills/${category}/${entry.name}`);
        }
        walk(full);
      }
    }
  }
  walk(SKILLS_DIR);
  return skills;
}

const skillCatalog = discoverSkills();
const skillNames = [...skillCatalog.keys()];

// ── Include catalog ──────────────────────────────────────────────

function discoverIncludes(): Map<string, string> {
  const includes = new Map<string, string>();
  function walk(dir: string) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.name.endsWith(".md")) {
        const rel = path.relative(INCLUDES_DIR, full).replace(/\.md$/, "");
        includes.set(rel, full);
      }
    }
  }
  walk(INCLUDES_DIR);
  return includes;
}

const includeCatalog = discoverIncludes();

// ── Agent discovery ──────────────────────────────────────────────

interface AgentFile {
  profile: string;
  name: string;
  filePath: string;
  subAgents: string[];
}

function discoverAgents(): AgentFile[] {
  const agents: AgentFile[] = [];
  for (const profileDir of fs.readdirSync(PROFILES_DIR, { withFileTypes: true })) {
    if (!profileDir.isDirectory()) continue;
    if (filterProfile && profileDir.name !== filterProfile) continue;
    const agentsDir = path.join(PROFILES_DIR, profileDir.name, "agents");
    if (!fs.existsSync(agentsDir)) continue;
    for (const agentFile of fs.readdirSync(agentsDir)) {
      if (!agentFile.endsWith(".agent.md")) continue;
      if (filterAgent && !agentFile.includes(filterAgent)) continue;
      const fullPath = path.join(agentsDir, agentFile);
      const content = fs.readFileSync(fullPath, "utf-8");

      // Parse sub-agents from YAML frontmatter
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

      agents.push({
        profile: profileDir.name,
        name: agentFile.replace(/\.agent\.md$/, ""),
        filePath: fullPath,
        subAgents,
      });
    }
  }
  return agents;
}

// ── Reference extraction ─────────────────────────────────────────

interface NodeRef {
  type: "render" | "skill" | "sub-agent" | "conditional-render";
  target: string;
  /** Context for conditional references */
  condition?: string;
}

function extractRefs(content: string): NodeRef[] {
  const refs: NodeRef[] = [];
  const seen = new Set<string>();

  // {% render 'name' %} — Liquid include tags
  // Check if preceded by {% if ... %} or {% unless ... %} on a nearby line
  const lines = content.split("\n");
  // Track the nearest open conditional (with line number) to pair with renders
  let activeCondition: { label: string; line: number } | null = null;
  for (let i = 0; i < lines.length; i++) {
    // Track conditionals: {% if X %}, {% unless X %}, {% else %}, {% endif %}, {% endunless %}
    const condOpen = lines[i].match(/\{%[-\s]*(?:if|unless)\s+(.*?)\s*[-]?%\}/);
    const condClose = /\{%[-\s]*(?:endif|endunless)\s*[-]?%\}/.test(lines[i]);
    const condElse = /\{%[-\s]*else\s*[-]?%\}/.test(lines[i]);
    if (condClose) activeCondition = null;
    if (condElse && activeCondition) {
      // Flip the condition label
      const label: string = activeCondition.label.startsWith("not ")
        ? activeCondition.label.slice(4)
        : `not ${activeCondition.label}`;
      activeCondition = { label, line: i };
    }
    if (condOpen) {
      const raw = condOpen[1].trim();
      // {% unless X %} → show as "not X"
      const isUnless = /\{%[-\s]*unless/.test(lines[i]);
      activeCondition = { label: isUnless ? `not ${raw}` : raw, line: i };
    }

    const renderMatch = lines[i].match(/\{%[-\s]*render\s+'([^']+)'[^%]*%\}/);
    if (renderMatch) {
      const target = renderMatch[1];
      const key = `render:${target}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const condition = activeCondition?.label;

      refs.push({
        type: condition ? "conditional-render" : "render",
        target,
        condition,
      });
    }

    // Skill name mentions on this line — match known skill names in any common format:
    //   **skill-name**           bold
    //   `skill-name`             backtick
    //   | skill-name |           table cell (plain)
    //   | **skill-name** |       table cell (bold)
    //   Skill: **skill-name**    labeled list item
    //   - **skill-name** —       dash-list bold
    //   "skill-name"             JSON string
    for (const skillName of skillNames) {
      const key = `skill:${skillName}`;
      if (seen.has(key)) continue;
      const esc = escapeRegex(skillName);
      const pattern = new RegExp(
        `(?:` +
          `\\*\\*${esc}\\*\\*` + // **skill-name**
          `|\`${esc}\`` + // `skill-name`
          `|\\|\\s*${esc}\\s*\\|` + // | skill-name |
          `|"${esc}"` + // "skill-name"
          `)`,
      );
      if (pattern.test(lines[i])) {
        seen.add(key);
        const condition = activeCondition?.label;
        refs.push({ type: "skill", target: skillName, condition });
      }
    }
  }

  return refs;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ── Graph building ───────────────────────────────────────────────

interface GraphNode {
  id: string;
  label: string;
  nodeType: "agent" | "sub-agent" | "include" | "skill";
  category?: string;
  refs: NodeRef[];
  profile?: string;
}

function buildGraph(agent: AgentFile): Map<string, GraphNode> {
  const graph = new Map<string, GraphNode>();
  const queue: Array<{ id: string; type: "agent" | "include"; filePath: string }> = [];

  // Start with the agent file
  const agentId = `agent:${agent.profile}/${agent.name}`;
  const agentContent = fs.readFileSync(agent.filePath, "utf-8");
  const agentRefs = extractRefs(agentContent);

  // Add sub-agent references
  for (const sub of agent.subAgents) {
    agentRefs.push({ type: "sub-agent", target: sub });
  }

  graph.set(agentId, {
    id: agentId,
    label: agent.name,
    nodeType: "agent",
    refs: agentRefs,
    profile: agent.profile,
  });

  // Queue includes from agent
  for (const ref of agentRefs) {
    if (ref.type === "render" || ref.type === "conditional-render") {
      const includePath = includeCatalog.get(ref.target);
      if (includePath) {
        queue.push({ id: `include:${ref.target}`, type: "include", filePath: includePath });
      }
    }
  }

  // Process sub-agents
  for (const sub of agent.subAgents) {
    const subFile = path.join(PROFILES_DIR, agent.profile, "agents", `ralph.${sub}.agent.md`);
    if (fs.existsSync(subFile)) {
      const subId = `sub-agent:${agent.profile}/${sub}`;
      const subContent = fs.readFileSync(subFile, "utf-8");
      const subRefs = extractRefs(subContent);
      graph.set(subId, { id: subId, label: sub, nodeType: "sub-agent", refs: subRefs, profile: agent.profile });
      for (const ref of subRefs) {
        if (ref.type === "render" || ref.type === "conditional-render") {
          const includePath = includeCatalog.get(ref.target);
          if (includePath) {
            queue.push({ id: `include:${ref.target}`, type: "include", filePath: includePath });
          }
        }
      }
    }
  }

  // BFS through includes
  const visited = new Set<string>();
  while (queue.length > 0) {
    const item = queue.shift()!;
    if (visited.has(item.id)) continue;
    visited.add(item.id);

    const content = fs.readFileSync(item.filePath, "utf-8");
    const refs = extractRefs(content);
    const relPath = path.relative(INCLUDES_DIR, item.filePath).replace(/\.md$/, "");

    graph.set(item.id, {
      id: item.id,
      label: relPath,
      nodeType: "include",
      refs,
    });

    // Queue nested includes
    for (const ref of refs) {
      if (ref.type === "render" || ref.type === "conditional-render") {
        const includePath = includeCatalog.get(ref.target);
        if (includePath && !visited.has(`include:${ref.target}`)) {
          queue.push({ id: `include:${ref.target}`, type: "include", filePath: includePath });
        }
      }
    }
  }

  // Add skill nodes and traverse their cross-references (BFS)
  const skillQueue: string[] = [];
  const visitedSkills = new Set<string>();

  // Collect initial skill references from all nodes so far
  for (const node of graph.values()) {
    for (const ref of node.refs) {
      if (ref.type === "skill" && !visitedSkills.has(ref.target)) {
        skillQueue.push(ref.target);
      }
    }
  }

  while (skillQueue.length > 0) {
    const skillName = skillQueue.shift()!;
    if (visitedSkills.has(skillName)) continue;
    visitedSkills.add(skillName);

    const skillId = `skill:${skillName}`;
    const relPath = skillCatalog.get(skillName);
    const category = relPath ? relPath.split("/")[1] : "unknown";

    // Read skill file for cross-references to other skills
    let crossRefs: NodeRef[] = [];
    if (relPath) {
      const skillFilePath = path.join(SKILLS_DIR, relPath.replace(/^skills\//, ""), "SKILL.md");
      if (fs.existsSync(skillFilePath)) {
        const skillContent = fs.readFileSync(skillFilePath, "utf-8");
        crossRefs = extractRefs(skillContent).filter((r) => r.type === "skill" && r.target !== skillName);
        // Queue newly discovered skills
        for (const cr of crossRefs) {
          if (!visitedSkills.has(cr.target)) {
            skillQueue.push(cr.target);
          }
        }
      }
    }

    graph.set(skillId, {
      id: skillId,
      label: skillName,
      nodeType: "skill",
      category,
      refs: crossRefs,
    });
  }

  return graph;
}

// ── ASCII tree renderer ──────────────────────────────────────────

const COLORS = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  agent: "\x1b[1;36m", // bold cyan
  subAgent: "\x1b[36m", // cyan
  include: "\x1b[33m", // yellow
  skill: "\x1b[32m", // green
  skillDomain: "\x1b[32m",
  skillWorkflow: "\x1b[34m", // blue
  skillInteg: "\x1b[35m", // magenta
  skillTask: "\x1b[33m", // yellow
  condition: "\x1b[2;35m", // dim magenta
  connector: "\x1b[2m", // dim
  header: "\x1b[1;37m", // bold white
};

function skillColor(category?: string): string {
  if (!category) return COLORS.skill;
  if (category.startsWith("domain")) return COLORS.skillDomain;
  if (category.startsWith("workflow")) return COLORS.skillWorkflow;
  if (category.startsWith("integrations")) return COLORS.skillInteg;
  if (category.startsWith("tasks")) return COLORS.skillTask;
  return COLORS.skill;
}

function renderAsciiTree(agent: AgentFile, graph: Map<string, GraphNode>): string {
  const lines: string[] = [];
  const printed = new Set<string>();

  function printNode(nodeId: string, prefix: string, isLast: boolean, depth: number) {
    const node = graph.get(nodeId);
    if (!node) return;

    const connector = isLast ? "└── " : "├── ";
    const childPrefix = isLast ? "    " : "│   ";

    // Icon and color by type
    let icon: string;
    let color: string;
    let suffix = "";
    switch (node.nodeType) {
      case "agent":
        icon = "🤖";
        color = COLORS.agent;
        break;
      case "sub-agent":
        icon = "🧩";
        color = COLORS.subAgent;
        break;
      case "include":
        icon = "📄";
        color = COLORS.include;
        break;
      case "skill":
        icon = "⚡";
        color = skillColor(node.category);
        suffix = node.category ? ` ${COLORS.dim}[${node.category}]${COLORS.reset}` : "";
        break;
    }

    if (depth === 0) {
      lines.push(`${color}${icon} ${node.label}${COLORS.reset}${suffix}`);
    } else {
      lines.push(
        `${COLORS.connector}${prefix}${connector}${COLORS.reset}${color}${icon} ${node.label}${COLORS.reset}${suffix}`,
      );
    }

    // Prevent infinite loops but still show the node name with a back-ref marker
    if (printed.has(nodeId) && node.refs.length > 0) {
      lines.push(`${COLORS.connector}${prefix}${childPrefix}${COLORS.dim}(↑ see above)${COLORS.reset}`);
      return;
    }
    printed.add(nodeId);

    // Collect children: first sub-agents, then renders, then skills
    interface ChildEntry {
      id: string;
      condition?: string;
    }
    const children: ChildEntry[] = [];

    // Sub-agents
    for (const ref of node.refs) {
      if (ref.type === "sub-agent") {
        const subId = `sub-agent:${agent.profile}/${ref.target}`;
        children.push({ id: subId });
      }
    }

    // Renders (includes)
    for (const ref of node.refs) {
      if (ref.type === "render" || ref.type === "conditional-render") {
        const includeId = `include:${ref.target}`;
        if (graph.has(includeId)) {
          children.push({ id: includeId, condition: ref.condition });
        }
      }
    }

    // Skills
    for (const ref of node.refs) {
      if (ref.type === "skill") {
        children.push({ id: `skill:${ref.target}`, condition: ref.condition });
      }
    }

    // Group consecutive children with the same condition
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      const nextPrefix = depth === 0 ? "" : prefix + childPrefix;

      if (child.condition) {
        // Collect all consecutive children with the same condition
        const group = [child];
        while (i + 1 < children.length && children[i + 1].condition === child.condition) {
          group.push(children[++i]);
        }
        const groupIsLast = i === children.length - 1;

        lines.push(
          `${COLORS.connector}${nextPrefix}${groupIsLast ? "└── " : "├── "}${COLORS.condition}[${child.condition}]${COLORS.reset}`,
        );
        const groupPrefix = nextPrefix + (groupIsLast ? "    " : "│   ");
        for (let g = 0; g < group.length; g++) {
          printNode(group[g].id, groupPrefix, g === group.length - 1, depth + 2);
        }
      } else {
        const childIsLast = i === children.length - 1;
        printNode(child.id, nextPrefix, childIsLast, depth + 1);
      }
    }
  }

  const agentId = `agent:${agent.profile}/${agent.name}`;
  printNode(agentId, "", true, 0);
  return lines.join("\n");
}

// ── Mermaid renderer ─────────────────────────────────────────────

function renderMermaid(agent: AgentFile, graph: Map<string, GraphNode>): string {
  const lines: string[] = ["graph TD"];
  const edges: string[] = [];
  const nodeStyles = new Map<string, string>();
  const emitted = new Set<string>();

  function sanitizeId(id: string): string {
    return id.replace(/[^a-zA-Z0-9]/g, "_");
  }

  function emitNode(nodeId: string) {
    if (emitted.has(nodeId)) return;
    emitted.add(nodeId);
    const node = graph.get(nodeId);
    if (!node) return;

    const sId = sanitizeId(nodeId);
    switch (node.nodeType) {
      case "agent":
        lines.push(`    ${sId}["🤖 ${node.label}"]`);
        nodeStyles.set(sId, "fill:#0891b2,color:#fff,stroke:#06b6d4");
        break;
      case "sub-agent":
        lines.push(`    ${sId}["🧩 ${node.label}"]`);
        nodeStyles.set(sId, "fill:#0e7490,color:#fff,stroke:#06b6d4");
        break;
      case "include":
        lines.push(`    ${sId}["📄 ${node.label}"]`);
        nodeStyles.set(sId, "fill:#d97706,color:#fff,stroke:#f59e0b");
        break;
      case "skill": {
        const cat = node.category ?? "";
        let fill = "#22c55e";
        if (cat.startsWith("workflow")) fill = "#3b82f6";
        else if (cat.startsWith("integrations")) fill = "#a855f7";
        else if (cat.startsWith("tasks")) fill = "#eab308";
        lines.push(`    ${sId}["⚡ ${node.label}"]`);
        nodeStyles.set(sId, `fill:${fill},color:#fff,stroke:${fill}`);
        break;
      }
    }
  }

  function walk(nodeId: string) {
    const node = graph.get(nodeId);
    if (!node) return;
    emitNode(nodeId);

    const sId = sanitizeId(nodeId);

    for (const ref of node.refs) {
      let targetId: string;
      switch (ref.type) {
        case "sub-agent":
          targetId = `sub-agent:${agent.profile}/${ref.target}`;
          break;
        case "render":
        case "conditional-render":
          targetId = `include:${ref.target}`;
          break;
        case "skill":
          targetId = `skill:${ref.target}`;
          break;
      }

      if (!graph.has(targetId)) continue;
      emitNode(targetId);

      const edgeKey = `${sId}->${sanitizeId(targetId)}`;
      if (!emitted.has(edgeKey)) {
        emitted.add(edgeKey);
        const label = ref.condition ? ` -->|"${ref.condition}"| ` : " --> ";
        edges.push(`    ${sId}${label}${sanitizeId(targetId)}`);
      }

      if (!emitted.has(`walked:${targetId}`)) {
        emitted.add(`walked:${targetId}`);
        walk(targetId);
      }
    }
  }

  const agentId = `agent:${agent.profile}/${agent.name}`;
  walk(agentId);

  lines.push("");
  lines.push(...edges);
  lines.push("");
  for (const [sId, style] of nodeStyles) {
    lines.push(`    style ${sId} ${style}`);
  }

  return lines.join("\n");
}

// ── Main ─────────────────────────────────────────────────────────

const agents = discoverAgents();

if (agents.length === 0) {
  console.error("No agents found matching the filter criteria.");
  process.exit(1);
}

// Legend
if (!mermaidMode) {
  console.log(`${COLORS.header}╔══════════════════════════════════════════════╗${COLORS.reset}`);
  console.log(`${COLORS.header}║   Agent → Include → Skill Reference Graph   ║${COLORS.reset}`);
  console.log(`${COLORS.header}╚══════════════════════════════════════════════╝${COLORS.reset}`);
  console.log();
  console.log(`${COLORS.dim}Legend:${COLORS.reset}`);
  console.log(
    `  ${COLORS.agent}🤖 Agent${COLORS.reset}    ${COLORS.subAgent}🧩 Sub-agent${COLORS.reset}    ${COLORS.include}📄 Include${COLORS.reset}`,
  );
  console.log(
    `  ${COLORS.skillWorkflow}⚡ Skill [workflow]${COLORS.reset}    ${COLORS.skillDomain}⚡ Skill [domain]${COLORS.reset}`,
  );
  console.log(
    `  ${COLORS.skillInteg}⚡ Skill [integrations]${COLORS.reset}    ${COLORS.skillTask}⚡ Skill [tasks]${COLORS.reset}`,
  );
  console.log(`  ${COLORS.condition}[condition]${COLORS.reset} = conditional render`);
  console.log();
}

// Group by profile
const byProfile = new Map<string, AgentFile[]>();
for (const a of agents) {
  const list = byProfile.get(a.profile) ?? [];
  list.push(a);
  byProfile.set(a.profile, list);
}

for (const [profile, profileAgents] of byProfile) {
  if (!mermaidMode) {
    console.log(`${COLORS.bold}━━━ Profile: ${profile} ━━━${COLORS.reset}\n`);
  }

  for (const agent of profileAgents) {
    const graph = buildGraph(agent);

    if (mermaidMode) {
      console.log(`%% ${profile}/${agent.name}`);
      console.log(renderMermaid(agent, graph));
      console.log();
    } else {
      console.log(renderAsciiTree(agent, graph));
      console.log();
    }
  }
}

// Summary
if (!mermaidMode) {
  console.log(`${COLORS.bold}━━━ Summary ━━━${COLORS.reset}`);
  console.log(`  Profiles: ${byProfile.size}`);
  console.log(`  Agents: ${agents.length}`);
  console.log(`  Includes: ${includeCatalog.size}`);
  console.log(`  Skills: ${skillCatalog.size}`);
  console.log();

  // Unreferenced skills
  const allReferencedSkills = new Set<string>();
  for (const agent of agents) {
    const graph = buildGraph(agent);
    for (const node of graph.values()) {
      if (node.nodeType === "skill") {
        allReferencedSkills.add(node.label);
      }
    }
  }
  const unreferenced = skillNames.filter((s) => !allReferencedSkills.has(s));
  if (unreferenced.length > 0) {
    console.log(`${COLORS.dim}  Unreferenced skills (not reachable from any agent):${COLORS.reset}`);
    for (const s of unreferenced) {
      console.log(`    ${COLORS.dim}⚡ ${s}${COLORS.reset}`);
    }
    console.log();
  }
}
