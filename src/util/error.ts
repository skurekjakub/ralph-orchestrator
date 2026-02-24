import { ExecaError } from "execa";

/**
 * Extract a human-readable message from an unknown caught value.
 *
 * For {@link ExecaError}, appends stderr so callers see why the subprocess
 * failed, not just which command was run.
 *
 * Use in `catch (err)` blocks where `err` is typed as `unknown`.
 */
export function toErrorMessage(err: unknown): string {
  if (err instanceof ExecaError) {
    const stderr = err.stderr ? `\nstderr: ${err.stderr}` : "";
    return `${err.message}${stderr}`;
  }
  return err instanceof Error ? err.message : String(err);
}
