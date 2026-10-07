/** `text` cut to its first `max` characters, with `…` appended when anything was cut. */
export function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}
