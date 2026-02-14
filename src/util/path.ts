import { resolve } from "node:path";

/**
 * Resolve a user-provided path: strip surrounding quotes, expand `~`, and resolve to absolute.
 */
export function resolvePath(rawPath: string): string {
  const cleaned = rawPath.replace(/^["']|["']$/g, "");
  return cleaned.startsWith("~/")
    ? resolve(process.env.HOME ?? "/root", cleaned.slice(2))
    : resolve(cleaned);
}
