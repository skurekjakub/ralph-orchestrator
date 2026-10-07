import { join, posix } from "node:path";

/** The target repo's root inside the agent container; the repo is bind-mounted here. */
export const CONTAINER_WORKSPACE_DIR = "/workspace";

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
 * The host path a container path inside the workspace maps to through the target-repo bind mount.
 *
 * @throws Error when `containerPath` is not inside `/workspace`.
 */
export function hostWorkspacePath(repoPath: string, containerPath: string): string {
  const rel = workspaceRelative(containerPath);
  if (rel === undefined) throw new Error(`${containerPath} is not inside ${CONTAINER_WORKSPACE_DIR}`);
  return join(repoPath, ...rel.split("/"));
}
