import { execa } from "execa";
import type { ValidationCollector } from "./types";

/**
 * Checks the tools the orchestrator itself runs on the host. Perl runs the audit hooks' redactor
 * (`shared/hooks/lib/redact.pl`) over every transcript before it is stored or attached; without it no
 * transcript is attached.
 */
export async function validateHostTools({ errors }: ValidationCollector): Promise<void> {
  try {
    await execa("perl", ["-e", "1"], { timeout: 10_000 });
  } catch {
    errors.push(
      "perl was not found on the host\n" +
        "  Transcripts are scrubbed of credentials with shared/hooks/lib/redact.pl before they are stored or " +
        "attached; install perl 5",
    );
  }
}
