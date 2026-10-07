/** Work item ids name files and directories: a letter or digit first, then only word characters and `-`. */
const SAFE_ID_RE = /^[A-Za-z0-9][\w-]*$/;

/**
 * Reject a work item id that is unsafe as a file or directory name, such as one carrying a path separator
 * or `..`.
 *
 * @throws Error when `id` does not match {@link SAFE_ID_RE}.
 */
export function assertSafeItemId(id: string): void {
  if (!SAFE_ID_RE.test(id)) {
    throw new Error(`Unsafe work item ID for filesystem use: "${id}"`);
  }
}
