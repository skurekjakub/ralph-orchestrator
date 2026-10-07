import { once } from "node:events";
import { Readable } from "node:stream";
import { text } from "node:stream/consumers";
import { describe, expect, it } from "vitest";
import { SseEventFilter, type SseDataRewriter } from "../src/sse-filter";

/** Push `chunks` through a filter and collect the output. */
function run(chunks: (string | Buffer)[], rewrite: SseDataRewriter, maxEventLength?: number): Promise<string> {
  return text(
    Readable.from(chunks.map((c) => (typeof c === "string" ? Buffer.from(c) : c))).pipe(
      new SseEventFilter(rewrite, maxEventLength),
    ),
  );
}

const upper: SseDataRewriter = (data) => (data.startsWith("rewrite") ? data.toUpperCase() : undefined);

describe("SseEventFilter", () => {
  it("passes events the rewriter leaves alone through byte for byte", async () => {
    // Arrange
    const stream = ": keep-alive\r\nretry: 1000\r\n\r\nid: 1\nevent: message\ndata: keep\n\n";

    // Act
    const out = await run([stream], upper);

    // Assert
    expect(out).toBe(stream);
  });

  it("rewrites message event data and keeps the other fields in place", async () => {
    // Act
    const out = await run(["id: 7\nevent: message\ndata: rewrite me\n\n"], upper);

    // Assert
    expect(out).toBe("id: 7\nevent: message\ndata: REWRITE ME\n\n");
  });

  it("treats an event without an event field as a message", async () => {
    // Act & Assert
    expect(await run(["data: rewrite\n\n"], upper)).toBe("data: REWRITE\n\n");
  });

  it("leaves events of other types alone", async () => {
    // Arrange
    const stream = "event: ping\ndata: rewrite\n\n";

    // Act & Assert
    expect(await run([stream], upper)).toBe(stream);
  });

  it("joins multi-line data before rewriting and emits the replacement as data lines", async () => {
    // Arrange
    const seen: string[] = [];

    // Act
    const out = await run(["data: rewrite\ndata: two\n\n"], (data) => {
      seen.push(data);
      return "a\nb";
    });

    // Assert
    expect(seen).toEqual(["rewrite\ntwo"]);
    expect(out).toBe("data: a\ndata: b\n\n");
  });

  it("reassembles events split across chunks, including a CRLF split between chunks", async () => {
    // Act
    const out = await run(["id: 1\r", "\ndata: rew", "rite", "\r\n", "\r", "\n"], upper);

    // Assert
    expect(out).toBe("id: 1\r\ndata: REWRITE\r\n\r\n");
  });

  it("decodes multi-byte characters split across chunks", async () => {
    // Arrange
    const bytes = Buffer.from("data: rewrite é\n\n");
    const split = bytes.indexOf(0xc3) + 1;

    // Act & Assert
    expect(await run([bytes.subarray(0, split), bytes.subarray(split)], upper)).toBe("data: REWRITE É\n\n");
  });

  it("emits each event as soon as its blank line arrives", async () => {
    // Arrange
    const filter = new SseEventFilter(upper);
    const emitted = once(filter, "data");

    // Act
    filter.write("data: rewrite one\n\ndata: partial");

    // Assert
    const [chunk] = (await emitted) as [Buffer];
    expect(chunk.toString()).toBe("data: REWRITE ONE\n\n");
    filter.destroy();
  });

  it("flushes an unterminated trailing event unchanged when the stream ends", async () => {
    // Act & Assert
    expect(await run(["data: rewrite\n\ndata: tail"], upper)).toBe("data: REWRITE\n\ndata: tail");
  });

  describe("event length cap", () => {
    it("passes events up to the cap", async () => {
      // Act & Assert
      expect(await run(["data: rewrite\n\n"], upper, 14)).toBe("data: REWRITE\n\n");
    });

    it.each([
      ["arrives whole", ["data: rewrite me please\n\n"]],
      ["arrives line by line", ["data: rewrite\n", "data: me please\n", "\n"]],
      ["is still unterminated", ["data: rewrite me please, this line has no end yet"]],
    ])("fails the stream when an event over the cap %s", async (_label, chunks) => {
      // Act
      const out = run(chunks, upper, 16);

      // Assert
      await expect(out).rejects.toThrow("SSE event longer than 16 characters");
    });
  });
});
