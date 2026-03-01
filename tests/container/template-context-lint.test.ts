import { describe, it, expect } from "vitest";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { buildTemplateContext } from "../../src/container/setup/agent-includes.js";
import { makeTaskContext } from "../helpers/factories.js";

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
  "cli",
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
]);

/**
 * Top-level context keys that hold objects with dynamic sub-keys.
 * References like `triggerParams.codesamples` are valid — we only
 * validate that the root (`triggerParams`) exists in TemplateContext.
 */
const DYNAMIC_PARENT_KEYS: ReadonlySet<string> = new Set(["triggerParams"]);

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
    const ctx = buildTemplateContext(makeTaskContext());
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
        if (!KNOWN_KEYS.has(root)) {
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
        if (!KNOWN_KEYS.has(root)) {
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
          if (ref.includes(".") && !DYNAMIC_PARENT_KEYS.has(root)) {
            errors.push(`${relPath}: dotted access "{{ ${ref} }}" but "${root}" is not a known dynamic key`);
          }
        }
      }
    }

    expect(errors, `Invalid dotted variable access:\n${errors.join("\n")}`).toEqual([]);
  });
});
