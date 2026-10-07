import { StringDecoder } from "node:string_decoder";
import { Transform, type TransformCallback } from "node:stream";

/**
 * Decides the new `data` of one SSE message event.
 *
 * @returns The replacement data, or `undefined` to pass the event through unchanged.
 */
export type SseDataRewriter = (data: string) => string | undefined;

/**
 * Transform stream over a `text/event-stream` body that rewrites the data of selected message
 * events (no `event:` field, or `event: message`).
 *
 * Every event is forwarded as soon as its terminating blank line arrives. Events the rewriter
 * leaves alone, comments, `id:`/`retry:` fields and line endings pass through byte for byte.
 * A rewritten event keeps its non-data fields in order and carries the new data in place of its
 * first `data:` line. An event that grows past `maxEventLength` characters fails the stream.
 */
export class SseEventFilter extends Transform {
  private readonly decoder = new StringDecoder("utf8");
  private pending = "";
  private scanOffset = 0;
  private eventLines: string[] = [];
  private eventLength = 0;

  constructor(
    private readonly rewrite: SseDataRewriter,
    private readonly maxEventLength: number = Number.POSITIVE_INFINITY,
  ) {
    super();
  }

  override _transform(chunk: Buffer, _encoding: BufferEncoding, callback: TransformCallback): void {
    try {
      this.pending += this.decoder.write(chunk);
      this.drainLines(false);
      this.checkLength(this.pending.length);
      callback();
    } catch (err) {
      callback(err as Error);
    }
  }

  override _flush(callback: TransformCallback): void {
    try {
      this.pending += this.decoder.end();
      this.drainLines(true);
      const unterminated = this.eventLines.join("") + this.pending;
      if (unterminated !== "") this.push(unterminated);
      this.eventLines = [];
      this.pending = "";
      callback();
    } catch (err) {
      callback(err as Error);
    }
  }

  private drainLines(final: boolean): void {
    const text = this.pending;
    let lineStart = 0;
    let nextLf = text.indexOf("\n", this.scanOffset);
    let nextCr = text.indexOf("\r", this.scanOffset);
    while (nextLf !== -1 || nextCr !== -1) {
      let end: number;
      let next: number;
      if (nextCr !== -1 && (nextLf === -1 || nextCr < nextLf)) {
        // A trailing CR may be the first half of a CRLF split across chunks.
        if (nextCr === text.length - 1 && !final) break;
        end = nextCr;
        next = text[nextCr + 1] === "\n" ? nextCr + 2 : nextCr + 1;
      } else {
        end = nextLf;
        next = nextLf + 1;
      }

      this.acceptLine(text.slice(lineStart, end), text.slice(end, next));
      lineStart = next;
      if (nextLf !== -1 && nextLf < next) nextLf = text.indexOf("\n", next);
      if (nextCr !== -1 && nextCr < next) nextCr = text.indexOf("\r", next);
    }
    this.pending = text.slice(lineStart);
    // The unconsumed tail holds no terminator except possibly a trailing CR, so resume the scan there.
    this.scanOffset = Math.max(0, this.pending.length - 1);
  }

  private acceptLine(line: string, terminator: string): void {
    if (line === "") {
      this.push(this.renderEvent() + terminator);
      this.eventLines = [];
      this.eventLength = 0;
    } else {
      this.eventLines.push(line + terminator);
      this.eventLength += line.length + terminator.length;
      this.checkLength(0);
    }
  }

  /** Fail when the current event, plus `unterminated` characters of a line still arriving, exceeds the cap. */
  private checkLength(unterminated: number): void {
    if (this.eventLength + unterminated > this.maxEventLength) {
      throw new Error(`SSE event longer than ${this.maxEventLength} characters`);
    }
  }

  private renderEvent(): string {
    const raw = this.eventLines.join("");
    let eventType: string | undefined;
    const dataValues: string[] = [];
    for (const rawLine of this.eventLines) {
      const field = parseField(rawLine);
      if (field?.name === "event") eventType = field.value;
      if (field?.name === "data") dataValues.push(field.value);
    }
    if (dataValues.length === 0 || (eventType !== undefined && eventType !== "message")) return raw;

    const data = dataValues.join("\n");
    const replacement = this.rewrite(data);
    if (replacement === undefined || replacement === data) return raw;

    let out = "";
    let dataWritten = false;
    for (const rawLine of this.eventLines) {
      if (parseField(rawLine)?.name !== "data") {
        out += rawLine;
        continue;
      }
      if (dataWritten) continue;
      dataWritten = true;
      const terminator = rawLine.slice(stripTerminator(rawLine).length);
      out += replacement
        .split("\n")
        .map((value) => `data: ${value}${terminator}`)
        .join("");
    }
    return out;
  }
}

function stripTerminator(rawLine: string): string {
  return rawLine.replace(/\r\n$|\r$|\n$/, "");
}

function parseField(rawLine: string): { name: string; value: string } | undefined {
  const line = stripTerminator(rawLine);
  if (line.startsWith(":")) return undefined;
  const colon = line.indexOf(":");
  if (colon === -1) return { name: line, value: "" };
  const value = line.slice(colon + 1);
  return { name: line.slice(0, colon), value: value.startsWith(" ") ? value.slice(1) : value };
}
