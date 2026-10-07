/** Names that name files and directories: a letter or digit first, then only word characters and `-`. */
const SAFE_NAME_RE = /^[A-Za-z0-9][\w-]*$/;

/** Whether `name` is safe as a file or directory name: no path separator, no `..`, no leading dot. */
export function isSafeName(name: string): boolean {
  return SAFE_NAME_RE.test(name);
}

/**
 * Reject a name that is unsafe as a file or directory name, such as one carrying a path separator or `..`.
 *
 * @param what What the name is, for the error (`work item ID`, `stage role`).
 * @throws Error when `name` is not {@link isSafeName safe}.
 */
export function assertSafeName(name: string, what: string): void {
  if (!isSafeName(name)) {
    throw new Error(`Unsafe ${what} for filesystem use: "${name}"`);
  }
}
