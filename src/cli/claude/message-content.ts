import { asArray, asRecord, asString } from "../../util/json";

/**
 * Text of a Claude Code tool result, whose `content` is a string or a list of content blocks. Text blocks
 * are joined with newlines; images and other blocks carry no text and are skipped.
 */
export function toolResultText(content: unknown): string {
  if (typeof content === "string") return content;
  return asArray(content)
    .map((block) => asString(asRecord(block)?.text))
    .filter((text): text is string => text !== undefined)
    .join("\n");
}
