import type { ToolCallback } from "@modelcontextprotocol/sdk/server/mcp.js";
import axios from "axios";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ZodRawShape } from "zod";

/** Tool definition returned by each tool module. */
export interface ToolDefinition {
  name: string;
  config: { description: string; inputSchema: ZodRawShape };
  handler: ToolCallback<ZodRawShape>;
}

export const ORG = "KenticoCustomerSuccess";
export const API_VERSION = "7.1";
export const apiBase = `https://dev.azure.com/${ORG}`;

export const ADO_PAT = process.env.ADO_PAT;

if (!ADO_PAT) {
  console.error("ADO_PAT must be set");
  process.exit(1);
}

const authHeader = `Basic ${Buffer.from(`:${ADO_PAT}`).toString("base64")}`;

/** Shared axios config for all requests. */
export function reqConfig(headers?: Record<string, string>) {
  return {
    headers: {
      "Content-Type": "application/json",
      Authorization: authHeader,
      ...headers,
    },
  };
}

/** Build a repo-scoped API URL. */
export function repoUrl(project: string, repositoryId: string, path: string) {
  return `${apiBase}/${encodeURIComponent(project)}/_apis/git/repositories/${encodeURIComponent(repositoryId)}/${path}?api-version=${API_VERSION}`;
}

export function errorResult(err: unknown) {
  const status = axios.isAxiosError(err) ? err.response?.status ?? 0 : 0;
  const message = axios.isAxiosError(err) ? err.response?.data ?? err.message : String(err);
  return {
    content: [{ type: "text" as const, text: JSON.stringify({ error: true, status, message }) }],
    isError: true,
  };
}

/**
 * Sanitize text content from LLM agents.
 *
 * Agents frequently produce literal `\n` (two-char backslash-n) instead of actual
 * newlines in JSON string values. ADO's markdown renderer needs real newlines.
 */
export function sanitizeContent(raw: string): string {
  return raw.replace(/\\n/g, "\n");
}

/**
 * Task-scoped env vars injected by the orchestrator's JIT config writer.
 * When set, tools use these as defaults and remove corresponding params from schemas.
 */
export const TASK_PROJECT = process.env.ADO_PROJECT;
export const TASK_REPO = process.env.ADO_REPO;
export const TASK_BRANCH = process.env.TASK_BRANCH;
export const TARGET_BRANCH = process.env.TARGET_BRANCH;
export const SOURCE_BRANCH = process.env.SOURCE_BRANCH;

/** Absolute path to the repo root inside the sidecar container. */
export const REPO_ROOT = process.env.REPO_ROOT;

/** Git identity for commits made by the MCP server. */
const GIT_USER_NAME = process.env.GIT_USER_NAME ?? "Ralph";
const GIT_USER_EMAIL = process.env.GIT_USER_EMAIL ?? "ralph@noreply.dev";

const execFileAsync = promisify(execFile);

/**
 * Execute a git command in the repo root directory.
 *
 * Authenticates via `http.extraHeader` with the ADO PAT (Base64 Basic auth).
 * The `GIT_TERMINAL_PROMPT=0` env prevents git from hanging on auth prompts.
 */
export async function gitExec(args: string[]): Promise<{ stdout: string; stderr: string }> {
  if (!REPO_ROOT) throw new Error("REPO_ROOT env var is not set — cannot run git commands");
  if (!ADO_PAT) throw new Error("ADO_PAT env var is not set — cannot authenticate git");

  try {
    return await execFileAsync("git", [
      "-c", `user.name=${GIT_USER_NAME}`,
      "-c", `user.email=${GIT_USER_EMAIL}`,
      "-c", `http.extraHeader=Authorization: ${authHeader}`,
      ...args,
    ], {
      cwd: REPO_ROOT,
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
      timeout: 120_000,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(msg.replaceAll(ADO_PAT, "***"));
  }
}

/** Stage all changes, commit, and force-push to a task branch. */
export async function gitStageCommitPush(
  message: string, branch: string,
): Promise<{ stdout: string; stderr: string }> {
  let isIgnored = false;

  // Stage
  try {
      // git check-ignore exits with 0 if ignored
      await gitExec(["check-ignore", "-q", ".ralph/"]);
      isIgnored = true; 
  } catch (error) {
      // exits with code 1 if not ignored
      isIgnored = false; 
  }

  if (isIgnored) {
      // It's already in .gitignore, safe to use -A
      await gitExec(["add", "-A"]);
  } else {
      // It's not in .gitignore, we must exclude it manually
      await gitExec(["add", ".", ":!.ralph/*"]);
  }

  // Commit
  await gitExec(["commit", "-m", message, "--allow-empty"]);
  
  // Push
  return gitExec(["push", "origin", `HEAD:refs/heads/${branch}`, "--force-with-lease"]);
}
