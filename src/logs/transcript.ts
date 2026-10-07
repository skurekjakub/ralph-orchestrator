import { truncate } from "../util/text";
import type { ITextRedactor } from "./text-redactor";

/** A text a transcript quotes in a fenced code block, cut to `maxChars` only once it has been redacted. */
export interface TranscriptQuote {
  readonly quote: string;
  readonly maxChars: number;
  /** The fence's info string, such as `json`. */
  readonly info: string;
}

/** One line of a derived transcript before redaction: Markdown the renderer wrote, or a text it quotes. */
export type TranscriptLine = string | TranscriptQuote;

/** `text` in a fenced code block whose fence is longer than any backtick run inside it. */
function fenced(text: string, info: string): string {
  const longestRun = Math.max(0, ...(text.match(/`+/g) ?? []).map((run) => run.length));
  const fence = "`".repeat(Math.max(3, longestRun + 1));
  return `${fence}${info}\n${text}\n${fence}`;
}

/**
 * Redacts a derived transcript in one pass and joins its lines as Markdown. Each quoted text is redacted
 * whole and only then cut and fenced, so a credential the cut would split leaves no prefix behind; each
 * run of the renderer's own lines is redacted as one text.
 *
 * @throws Error when the redaction fails.
 */
export async function redactTranscript(lines: readonly TranscriptLine[], redactor: ITextRedactor): Promise<string> {
  const chunks: TranscriptLine[] = [];
  for (const line of lines) {
    const last = chunks.at(-1);
    if (typeof line === "string" && typeof last === "string") chunks[chunks.length - 1] = `${last}\n${line}`;
    else chunks.push(line);
  }
  const redacted = await redactor.redactEach(chunks.map((chunk) => (typeof chunk === "string" ? chunk : chunk.quote)));
  return chunks
    .map((chunk, i) =>
      typeof chunk === "string" ? redacted[i] : fenced(truncate(redacted[i], chunk.maxChars), chunk.info),
    )
    .join("\n");
}
