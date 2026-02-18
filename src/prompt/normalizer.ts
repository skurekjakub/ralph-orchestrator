/**
 * Content normalizer — sanitizes untrusted text before it enters the prompt.
 *
 * Removes invisible/obfuscation content that could hide adversarial instructions
 * from both the auditor and human reviewers while remaining visible to the LLM.
 *
 * Applied to individual content sections (description, comments, custom fields)
 * before they are assembled into the prompt.
 */

/**
 * Unicode characters used for invisible text injection.
 * Includes zero-width characters, bidirectional overrides, and other invisible
 * formatting characters that could hide adversarial content.
 */
const INVISIBLE_CHARS = /[\u200B\u200C\u200D\u200E\u200F\uFEFF\u2060\u2061\u2062\u2063\u2064\u2066\u2067\u2068\u2069\u202A\u202B\u202C\u202D\u202E\u00AD]/g;

/** HTML comments that could contain hidden instructions. */
const HTML_COMMENTS = /<!--[\s\S]*?-->/g;

/**
 * Excessive whitespace runs (more than 2 consecutive blank lines).
 * Attackers use large whitespace gaps to push content off-screen in
 * human review while the LLM still processes it.
 */
const EXCESSIVE_BLANK_LINES = /\n{4,}/g;

/** Non-standard whitespace characters (excludes space, tab, newline, CR). */
const NON_STANDARD_WHITESPACE = /[\u00A0\u1680\u2000-\u200A\u2028\u2029\u205F\u3000]/g;

/**
 * Normalize untrusted content by removing invisible characters,
 * hidden HTML comments, and normalizing whitespace.
 *
 * This is a **lossy** transformation — it intentionally strips content
 * that has no legitimate purpose in JIRA issue text.
 *
 * @returns The normalized text.
 */
export function normalizeContent(text: string): string {
  let result = text;

  result = result.replace(INVISIBLE_CHARS, "");

  result = result.replace(HTML_COMMENTS, "");

  result = result.replace(NON_STANDARD_WHITESPACE, " ");

  result = result.replace(EXCESSIVE_BLANK_LINES, "\n\n\n");

  return result;
}

/**
 * Check whether normalization would change the text.
 * Useful for logging whether suspicious content was cleaned.
 */
export function needsNormalization(text: string): boolean {
  return text !== normalizeContent(text);
}
