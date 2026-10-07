/** A parsed JSON object whose fields are untrusted and checked before use. */
export type JsonRecord = Readonly<Record<string, unknown>>;

/** `value` when it is a JSON object (not an array or null). */
export function asRecord(value: unknown): JsonRecord | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as JsonRecord) : undefined;
}

/** `value` when it is a string. */
export function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

/** `value` when it is a finite number. */
export function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/** `value` when it is an array, else an empty one. */
export function asArray(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : [];
}
