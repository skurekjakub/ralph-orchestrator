import { join, posix } from "node:path";

/** The workspace root inside the agent container and the MCP sidecar; the task's workspace is bind-mounted here. */
export const CONTAINER_WORKSPACE_DIR = "/workspace";

/** Ralph's runtime directory inside the workspace: MCP config, CLI homes, logs and task artifacts. */
export const RALPH_CONTAINER_DIR = `${CONTAINER_WORKSPACE_DIR}/.ralph`;

/** `containerPath` relative to the container workspace, or undefined when it lies outside it. */
function workspaceRelative(containerPath: string): string | undefined {
  const rel = posix.relative(CONTAINER_WORKSPACE_DIR, containerPath);
  return rel === "" || rel === ".." || rel.startsWith("../") || posix.isAbsolute(rel) ? undefined : rel;
}

/**
 * A container path inside the workspace, relative to it, with a trailing `/` when it is a directory.
 *
 * @throws Error when `containerPath` is not inside `/workspace`.
 */
export function workspaceMountTarget(containerPath: string, isDirectory: boolean): string {
  const rel = workspaceRelative(containerPath);
  if (rel === undefined) throw new Error(`${containerPath} is not inside ${CONTAINER_WORKSPACE_DIR}`);
  return isDirectory ? `${rel}/` : rel;
}

/**
 * The host path a container path inside the workspace maps to through the workspace bind mount.
 *
 * @param workspacePath The task's workspace on the host.
 * @throws Error when `containerPath` is not inside `/workspace`.
 */
export function hostWorkspacePath(workspacePath: string, containerPath: string): string {
  const rel = workspaceRelative(containerPath);
  if (rel === undefined) throw new Error(`${containerPath} is not inside ${CONTAINER_WORKSPACE_DIR}`);
  return join(workspacePath, ...rel.split("/"));
}

/**
 * The container paths of the directories that hold `mountTargets`: a directory target itself, a file
 * target's parent. The workspace root is left out, and each directory is listed once.
 *
 * @param mountTargets Paths relative to `/workspace` as {@link workspaceMountTarget} returns them.
 */
export function mountTargetDirs(mountTargets: readonly string[]): string[] {
  const dirs = mountTargets
    .map((target) => (target.endsWith("/") ? target.slice(0, -1) : posix.dirname(target)))
    .filter((dir) => dir !== ".");
  return [...new Set(dirs)].map((dir) => `${CONTAINER_WORKSPACE_DIR}/${dir}`);
}
