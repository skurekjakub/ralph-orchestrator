import { Readable } from "node:stream";
import { text } from "node:stream/consumers";
import { describe, expect, it } from "vitest";
import { SseEventFilter, type SseDataRewriter } from "../src/sse-filter";

/** Push `chunks` through a filter and collect the output. */
function run(chunks: (string | Buffer)[], rewrite: SseDataRewriter): Promise<string> {
  return text(
    Readable.from(chunks.map((c) => (typeof c === "string" ? Buffer.from(c) : c))).pipe(new SseEventFilter(rewrite)),
  );
}

const upper: SseDataRewriter = (data) => (data.startsWith("rewrite") ? data.toUpperCase() : undefined);

describe("SseEventFilter", () => {
  it("passes events the rewriter leaves alone through byte for byte", async () => {
    const stream = ": keep-alive\r\nretry: 1000\r\n\r\nid: 1\nevent: message\ndata: keep\n\n";

    expect(await run([stream], upper)).toBe(stream);
  });

  it("rewrites message event data and keeps the other fields in place", async () => {
    const out = await run(["id: 7\nevent: message\ndata: rewrite me\n\n"], upper);

    expect(out).toBe("id: 7\nevent: message\ndata: REWRITE ME\n\n");
  });

  it("treats an event without an event field as a message", async () => {
    expect(await run(["data: rewrite\n\n"], upper)).toBe("data: REWRITE\n\n");
  });

  it("leaves events of other types alone", async () => {
    const stream = "event: ping\ndata: rewrite\n\n";

    expect(await run([stream], upper)).toBe(stream);
  });

  it("joins multi-line data before rewriting and emits the replacement as data lines", async () => {
    const seen: string[] = [];
    const out = await run(["data: rewrite\ndata: two\n\n"], (data) => {
      seen.push(data);
      return "a\nb";
    });

    expect(seen).toEqual(["rewrite\ntwo"]);
    expect(out).toBe("data: a\ndata: b\n\n");
  });

  it("reassembles events split across chunks, including a CRLF split between chunks", async () => {
    const out = await run(["id: 1\r", "\ndata: rew", "rite", "\r\n", "\r", "\n"], upper);

    expect(out).toBe("id: 1\r\ndata: REWRITE\r\n\r\n");
  });

  it("decodes multi-byte characters split across chunks", async () => {
    const bytes = Buffer.from("data: rewrite é\n\n");
    const split = bytes.indexOf(0xc3) + 1;

    expect(await run([bytes.subarray(0, split), bytes.subarray(split)], upper)).toBe("data: REWRITE É\n\n");
  });

  it("emits each event as soon as its blank line arrives", async () => {
    const filter = new SseEventFilter(upper);
    const pushed: string[] = [];
    filter.on("data", (chunk: Buffer) => pushed.push(chunk.toString()));

    filter.write("data: rewrite one\n\ndata: partial");
    await new Promise((resolve) => setImmediate(resolve));

    expect(pushed.join("")).toBe("data: REWRITE ONE\n\n");
    filter.destroy();
  });

  it("flushes an unterminated trailing event unchanged when the stream ends", async () => {
    expect(await run(["data: rewrite\n\ndata: tail"], upper)).toBe("data: REWRITE\n\ndata: tail");
  });
});
