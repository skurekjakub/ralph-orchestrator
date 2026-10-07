import { describe, it, expect } from "vitest";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { buildTemplateContext, type AgentSelf } from "../../src/container/setup/agent-includes";
import { CLAUDE_TOOL_NAMES } from "../../src/cli/claude/claude-tools";
import { createCliRuntimeRegistry } from "../../src/cli/supported-runtimes";
import { ClaudeAuthMode } from "../../src/config/types";
import { makeTaskContext } from "../helpers/factories";

/**
 * Extract the explicitly typed keys of {@link TemplateContext}.
 *
 * The interface has an index signature (`[key: string]: unknown`) for
 * Liquid flexibility, but the concrete keys are the canonical set.
 * We can't reflect on interface keys at runtime, so we maintain this
 * set manually — if you add a field to TemplateContext, add it here.
 */
const KNOWN_KEYS: ReadonlySet<string> = new Set([
  "profileId",
  "repo",
  "targetRepoPath",
  "cli",
  "cliTools",
  "model",
  "agentName",
  "displayName",
  "mcpServers",
  "taskId",
  "taskTitle",
  "taskStatus",
  "taskType",
  "taskPriority",
  "taskLabels",
  "taskComponents",
  "taskProject",
  "taskDescription",
  "taskCreated",
  "taskUpdated",
  "commentTrigger",
  "triggerParams",
  "ralphchivesEnabled",
  "isRevision",
  "prUrl",
  "skills",
  "artifactDir",
  "stageRole",
  "stageMode",
  "stageIndex",
  "stageCount",
  "isFirstStage",
  "isLastStage",
  "previousStageRoles",
  "hook",
]);

/**
 * Variables only agent templates and the partials they render see: the per-agent `self`.
 * Skills are rendered once per stage, not per agent, so they must not use them.
 */
const AGENT_SCOPE_KEYS: ReadonlySet<string> = new Set(["self"]);

/** The fields of {@link AgentSelf}; `satisfies` fails the build when the interface gains or loses one. */
const SELF_FIELDS = {
  name: true,
  fileId: true,
  isStageRoot: true,
  subagents: true,
  model: true,
  subagentModels: true,
} satisfies Record<keyof AgentSelf, true>;

/**
 * Top-level context keys that hold objects with dynamic sub-keys.
 * References like `triggerParams.codesamples` are valid — we only
 * validate that the root (`triggerParams`) exists in TemplateContext.
 */
const DYNAMIC_PARENT_KEYS: ReadonlySet<string> = new Set(["triggerParams", "hook"]);

/** Context keys holding objects with a fixed set of fields; a dotted reference must name one of them. */
const FIXED_FIELD_KEYS: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  ["cliTools", new Set(Object.keys(CLAUDE_TOOL_NAMES))],
  ["self", new Set(Object.keys(SELF_FIELDS))],
]);

/**
 * Variables passed via `{% render 'partial', key: value %}` at render
 * time — valid inside shared includes but not part of TemplateContext.
 */
const RENDER_PARAM_KEYS: ReadonlySet<string> = new Set(["role"]);

/**
 * Strip `{% raw %}...{% endraw %}` blocks so example Liquid tags inside
 * documentation skills aren't treated as real variable references.
 */
function stripRawBlocks(content: string): string {
  return content.replace(/\{%-?\s*raw\s*-?%\}[\s\S]*?\{%-?\s*endraw\s*-?%\}/g, "");
}

/**
 * Strip fenced code blocks (``` ... ```) — these contain example snippets
 * with Liquid-like syntax that aren't actual template references.
 */
function stripCodeBlocks(content: string): string {
  return content.replace(/```[\s\S]*?```/g, "");
}

/**
 * Extract Liquid variable references from template content.
 *
 * Matches:
 * - `{{ varName }}` and `{{ varName.sub }}`
 * - `{% if varName %}`, `{% elsif varName %}`, `{% unless varName %}`
 * - `{% if varName.sub %}`, `{% unless varName.sub %}`
 * - `{% for x in varName %}`
 *
 * Returns the root variable name (before the first `.`).
 */
function extractVariableRefs(content: string): Map<string, string[]> {
  const cleaned = stripCodeBlocks(stripRawBlocks(content));
  const refs = new Map<string, string[]>();

  // {{ varName }} or {{ varName.sub }}
  const outputPattern = /\{\{[-\s]*([a-zA-Z_]\w*(?:\.\w+)*)\s*[-%\s]*\}\}/g;
  // {% if/elsif/unless/for-in varName %} or {% if varName.sub %}
  const tagPattern = /\{%-?\s*(?:if|elsif|unless)\s+([a-zA-Z_]\w*(?:\.\w+)*)(?:\s|%)/g;
  const forPattern = /\{%-?\s*for\s+\w+\s+in\s+([a-zA-Z_]\w*(?:\.\w+)*)\s/g;

  for (const pattern of [outputPattern, tagPattern, forPattern]) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(cleaned)) !== null) {
      const fullRef = match[1];
      const root = fullRef.split(".")[0];
      if (!refs.has(root)) refs.set(root, []);
      refs.get(root)!.push(fullRef);
    }
  }

  return refs;
}

/**
 * Recursively collect all `.md` files under a directory.
 */
async function collectMdFiles(dir: string): Promise<string[]> {
  if (!existsSync(dir)) return [];
  const results: string[] = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory() && entry.name !== ".build" && entry.name !== "node_modules") {
      results.push(...(await collectMdFiles(full)));
    } else if (entry.name.endsWith(".md")) {
      results.push(full);
    }
  }
  return results;
}

const REPO_ROOT = join(import.meta.dirname, "..", "..");

describe("Template context variable lint", () => {
  it("KNOWN_KEYS matches the actual keys produced by buildTemplateContext", () => {
    const ctx = buildTemplateContext(makeTaskContext(), createCliRuntimeRegistry(ClaudeAuthMode.OAuthToken));
    const runtimeKeys = new Set(Object.keys(ctx));
    const missing = [...runtimeKeys].filter((k) => !KNOWN_KEYS.has(k));
    const extra = [...KNOWN_KEYS].filter((k) => !runtimeKeys.has(k));
    expect(missing, `Keys in buildTemplateContext() but missing from KNOWN_KEYS — add them`).toEqual([]);
    expect(extra, `Keys in KNOWN_KEYS but not in buildTemplateContext() — remove them`).toEqual([]);
  });

  it("all Liquid variable references in agent templates resolve to TemplateContext keys", async () => {
    const dirs = [
      join(REPO_ROOT, "profiles", "ralph-docs", "agents"),
      join(REPO_ROOT, "profiles", "ralph-vscode", "agents"),
    ];

    const files = (await Promise.all(dirs.map(collectMdFiles))).flat();
    expect(files.length).toBeGreaterThan(0);

    const errors: string[] = [];

    for (const file of files) {
      const content = await readFile(file, "utf-8");
      const refs = extractVariableRefs(content);
      const relPath = file.replace(REPO_ROOT + "/", "");

      for (const [root, fullRefs] of refs) {
        if (!KNOWN_KEYS.has(root) && !AGENT_SCOPE_KEYS.has(root)) {
          errors.push(`${relPath}: unknown variable "{{ ${fullRefs[0]} }}" (root: "${root}")`);
        }
      }
    }

    expect(errors, `Unknown template variables:\n${errors.join("\n")}`).toEqual([]);
  });

  it("all Liquid variable references in shared includes resolve to TemplateContext keys", async () => {
    const dir = join(REPO_ROOT, "shared", "agent-includes");
    const files = await collectMdFiles(dir);
    expect(files.length).toBeGreaterThan(0);

    const errors: string[] = [];

    for (const file of files) {
      const content = await readFile(file, "utf-8");
      const refs = extractVariableRefs(content);
      const relPath = file.replace(REPO_ROOT + "/", "");

      for (const [root, fullRefs] of refs) {
        if (!KNOWN_KEYS.has(root) && !AGENT_SCOPE_KEYS.has(root) && !RENDER_PARAM_KEYS.has(root)) {
          errors.push(`${relPath}: unknown variable "{{ ${fullRefs[0]} }}" (root: "${root}")`);
        }
      }
    }

    expect(errors, `Unknown template variables:\n${errors.join("\n")}`).toEqual([]);
  });

  it("all Liquid variable references in skill templates resolve to TemplateContext keys", async () => {
    const dir = join(REPO_ROOT, "shared", "skills");
    const files = await collectMdFiles(dir);
    expect(files.length).toBeGreaterThan(0);

    const errors: string[] = [];

    for (const file of files) {
      const content = await readFile(file, "utf-8");
      const refs = extractVariableRefs(content);
      const relPath = file.replace(REPO_ROOT + "/", "");

      for (const [root, fullRefs] of refs) {
        if (!KNOWN_KEYS.has(root)) {
          errors.push(`${relPath}: unknown variable "{{ ${fullRefs[0]} }}" (root: "${root}")`);
        }
      }
    }

    expect(errors, `Unknown template variables:\n${errors.join("\n")}`).toEqual([]);
  });

  it("dotted references use known dynamic parent keys", async () => {
    const dirs = [
      join(REPO_ROOT, "profiles", "ralph-docs", "agents"),
      join(REPO_ROOT, "profiles", "ralph-vscode", "agents"),
      join(REPO_ROOT, "shared", "agent-includes"),
      join(REPO_ROOT, "shared", "skills"),
    ];

    const files = (await Promise.all(dirs.map(collectMdFiles))).flat();
    const errors: string[] = [];

    for (const file of files) {
      const content = await readFile(file, "utf-8");
      const refs = extractVariableRefs(content);
      const relPath = file.replace(REPO_ROOT + "/", "");

      for (const [root, fullRefs] of refs) {
        for (const ref of fullRefs) {
          if (!ref.includes(".")) continue;
          const fields = FIXED_FIELD_KEYS.get(root);
          if (fields) {
            const field = ref.split(".")[1];
            if (!fields.has(field)) errors.push(`${relPath}: "{{ ${ref} }}" — "${root}" has no field "${field}"`);
          } else if (!DYNAMIC_PARENT_KEYS.has(root)) {
            errors.push(`${relPath}: dotted access "{{ ${ref} }}" but "${root}" is not a known dynamic key`);
          }
        }
      }
    }

    expect(errors, `Invalid dotted variable access:\n${errors.join("\n")}`).toEqual([]);
  });
});
