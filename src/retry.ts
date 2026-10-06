import type { Logger } from "./logger.js";

export interface RetryOptions {
  /** Maximum number of attempts (default: 3). */
  attempts?: number;
  /** Base delay in milliseconds, multiplied by attempt number (default: 2000). */
  delayMs?: number;
}

/**
 * Retry an async operation with linear backoff.
 *
 * @param fn       The async function to retry.
 * @param label    A human-readable label for log messages.
 * @param logger   Logger for retry warnings.
 * @param options  Retry configuration (attempts, delayMs).
 * @returns The result of a successful `fn()` call.
 * @throws The last error if all attempts fail.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  label: string,
  logger?: Logger,
  options: RetryOptions = {},
): Promise<T> {
  const { attempts = 3, delayMs = 2000 } = options;
  for (let i = 1; i <= attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      if (i === attempts) throw err;
      const wait = delayMs * i;
      logger?.warn?.(`${label} failed (attempt ${i}/${attempts}), retrying in ${wait}ms...`);
      await sleep(wait);
    }
  }
  throw new Error("unreachable");
}

/** Sleep for `ms` milliseconds. */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
