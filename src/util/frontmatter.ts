/**
 * Frontmatter of Ralph's Markdown sources, read and written in a strict YAML subset.
 *
 * The subset covers what agent frontmatter needs and nothing else: `key: value` lines, plain,
 * single-quoted and double-quoted scalars, integers, booleans, one-line flow sequences of strings
 * (`[a, 'b c']`) and one level of nested `key:` blocks indented by two spaces. Anything else
 * (block sequences, multi-line scalars, anchors, tags, tabs) is rejected with the line number, so a
 * file never parses differently here than it would in a full YAML parser.
 */

/** A scalar frontmatter value. */
export type FrontmatterScalar = string | number | boolean;

/** A value of a nested block (`copilot:` → `model: gpt-5.4`). */
export type FrontmatterNestedValue = FrontmatterScalar | readonly string[];

/** A top-level frontmatter value. */
export type FrontmatterValue = FrontmatterNestedValue | Readonly<Record<string, FrontmatterNestedValue>>;

/** A Markdown source split at its frontmatter fences. */
export interface FrontmatterDocument {
  /** The text between the opening and closing `---` lines, without the fences. */
  readonly frontmatter: string;
  /** Everything after the closing `---` line. */
  readonly body: string;
}

/** Thrown when a source has no frontmatter or uses YAML outside the supported subset. */
export class FrontmatterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FrontmatterError";
  }
}

const FENCE = "---";
const KEY_LINE = /^([A-Za-z][\w-]*):(?:[ ]+(.*))?$/;
const NESTED_KEY_LINE = /^ {2}([A-Za-z][\w-]*):[ ]+(.+)$/;
const INTEGER = /^-?\d+$/;
/**
 * Plain scalars a YAML 1.1 or 1.2 parser reads as something other than a string: null, booleans,
 * numbers in any notation, and timestamps.
 */
const YAML_NON_STRING =
  /^(?:null|Null|NULL|~|true|True|TRUE|false|False|FALSE|yes|Yes|YES|no|No|NO|on|On|ON|off|Off|OFF|[-+]?\.(?:inf|Inf|INF)|\.(?:nan|NaN|NAN)|[-+]?0x[0-9a-fA-F_]+|[-+]?0o?[0-7_]+|[-+]?0b[01_]+|[-+]?(?:\.\d+|\d[\d_]*(?:\.\d*)?)(?:[eE][-+]?\d+)?|\d{4}-\d\d?-\d\d?(?:[Tt ].*)?)$/;

/** Characters that start a non-plain YAML node when they open a scalar. */
const INDICATOR_START = /^[[\]{}&*!|>%@`#,?:-]/;
/** Plain scalars that can be emitted unquoted. */
const SAFE_PLAIN = /^[A-Za-z0-9_.()[\]/-]+$/;

/**
 * Splits `source` into its frontmatter and body.
 *
 * @throws FrontmatterError when `source` does not open with a `---` line or never closes it.
 */
export function splitFrontmatter(source: string): FrontmatterDocument {
  const text = source.replace(/\r\n/g, "\n");
  if (!text.startsWith(`${FENCE}\n`)) {
    throw new FrontmatterError(`expected a frontmatter block opening with "${FENCE}" on the first line`);
  }
  const close = text.indexOf(`\n${FENCE}\n`, FENCE.length);
  const closeAtEnd = text.endsWith(`\n${FENCE}`) ? text.length - FENCE.length - 1 : -1;
  const end = close >= 0 ? close : closeAtEnd;
  if (end < 0) {
    throw new FrontmatterError(`frontmatter block is never closed with a "${FENCE}" line`);
  }
  return {
    frontmatter: text.slice(FENCE.length + 1, end + 1),
    body: text.slice(Math.min(end + FENCE.length + 2, text.length)),
  };
}

/**
 * Parses frontmatter text in the supported YAML subset.
 *
 * @throws FrontmatterError naming the offending line when the text leaves the subset or repeats a key.
 */
export function parseFrontmatter(text: string): Record<string, FrontmatterValue> {
  const result: Record<string, FrontmatterValue> = {};
  let nested: { key: string; values: Record<string, FrontmatterNestedValue> } | undefined;

  const lines = text.split("\n");
  lines.forEach((line, index) => {
    const lineNo = index + 1;
    const fail = (reason: string): never => {
      throw new FrontmatterError(`frontmatter line ${lineNo}: ${reason}`);
    };

    if (line.trim() === "" || line.trimStart().startsWith("#")) return;
    if (line.includes("\t")) fail("tabs are not allowed; indent with two spaces");

    if (line.startsWith(" ")) {
      if (!nested) fail("indented line without a parent key");
      const match = NESTED_KEY_LINE.exec(line);
      if (!match) fail("expected `  key: value` (two-space indent, one level of nesting only)");
      const [, key, raw] = match!;
      if (key in nested!.values) fail(`duplicate key "${nested!.key}.${key}"`);
      nested!.values[key] = parseInlineValue(raw, fail);
      return;
    }

    const match = KEY_LINE.exec(line);
    if (!match) fail("expected `key: value`");
    const [, key, raw] = match!;
    if (key in result) fail(`duplicate key "${key}"`);
    if (raw === undefined || raw.trim() === "") {
      const values: Record<string, FrontmatterNestedValue> = {};
      result[key] = values;
      nested = { key, values };
      return;
    }
    nested = undefined;
    result[key] = parseInlineValue(raw, fail);
  });

  return result;
}

/** One value written after `key: ` on a single line. */
function parseInlineValue(raw: string, fail: (reason: string) => never): FrontmatterNestedValue {
  const value = raw.trim();
  if (value.startsWith("[")) {
    if (!value.endsWith("]")) fail("a flow sequence must open and close on the same line");
    return parseFlowSequence(value.slice(1, -1), fail);
  }
  if (value.startsWith("'")) {
    const { text, rest } = readSingleQuoted(value, fail);
    if (rest.trim() !== "") fail("unexpected text after a quoted string");
    return text;
  }
  if (value.startsWith('"')) {
    const { text, rest } = readDoubleQuoted(value, fail);
    if (rest.trim() !== "") fail("unexpected text after a quoted string");
    return text;
  }
  if (value === "true") return true;
  if (value === "false") return false;
  if (INTEGER.test(value)) return Number(value);
  return readPlain(value, fail);
}

/** The items of a flow sequence, given the text between its brackets. Items are strings. */
function parseFlowSequence(inner: string, fail: (reason: string) => never): string[] {
  const items: string[] = [];
  let rest = inner.trim();
  if (rest === "") return items;

  for (;;) {
    let item: string;
    if (rest.startsWith("'")) {
      ({ text: item, rest } = readSingleQuoted(rest, fail));
    } else if (rest.startsWith('"')) {
      ({ text: item, rest } = readDoubleQuoted(rest, fail));
    } else {
      const comma = rest.indexOf(",");
      const token = (comma < 0 ? rest : rest.slice(0, comma)).trim();
      if (token === "") fail("empty item in a flow sequence");
      if (/[[\]{}]/.test(token)) fail("nested collections are not supported in a flow sequence");
      item = readPlain(token, fail);
      rest = comma < 0 ? "" : rest.slice(comma);
    }
    items.push(item);

    rest = rest.trimStart();
    if (rest === "") return items;
    if (!rest.startsWith(",")) fail("expected `,` between flow sequence items");
    rest = rest.slice(1).trimStart();
    if (rest === "") fail("trailing `,` in a flow sequence");
  }
}

/** A plain (unquoted) scalar, rejected when YAML would read it as anything but this exact string. */
function readPlain(value: string, fail: (reason: string) => never): string {
  if (INDICATOR_START.test(value) || value.includes(": ") || value.includes(" #") || value.endsWith(":")) {
    fail(`quote the value ${JSON.stringify(value)}; it is not a plain YAML string`);
  }
  if (YAML_NON_STRING.test(value)) {
    fail(`quote the value ${JSON.stringify(value)}; YAML reads it as a non-string`);
  }
  return value;
}

/** Reads a single-quoted scalar at the start of `value` (`''` escapes a quote). */
function readSingleQuoted(value: string, fail: (reason: string) => never): { text: string; rest: string } {
  let text = "";
  for (let i = 1; i < value.length; i++) {
    if (value[i] !== "'") {
      text += value[i];
      continue;
    }
    if (value[i + 1] === "'") {
      text += "'";
      i++;
      continue;
    }
    return { text, rest: value.slice(i + 1) };
  }
  return fail("unterminated single-quoted string");
}

/** Reads a double-quoted scalar at the start of `value`, with JSON escapes. */
function readDoubleQuoted(value: string, fail: (reason: string) => never): { text: string; rest: string } {
  for (let i = 1; i < value.length; i++) {
    if (value[i] === "\\") {
      i++;
      continue;
    }
    if (value[i] === '"') {
      try {
        return { text: JSON.parse(value.slice(0, i + 1)) as string, rest: value.slice(i + 1) };
      } catch {
        return fail("unsupported escape in a double-quoted string");
      }
    }
  }
  return fail("unterminated double-quoted string");
}

/** `value` as a single-quoted YAML scalar. */
export function yamlSingleQuoted(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

/** `value` as a YAML scalar: plain when that reads back as the same string, single-quoted otherwise. */
export function yamlScalar(value: string): string {
  return SAFE_PLAIN.test(value) && !INDICATOR_START.test(value) && !YAML_NON_STRING.test(value)
    ? value
    : yamlSingleQuoted(value);
}
