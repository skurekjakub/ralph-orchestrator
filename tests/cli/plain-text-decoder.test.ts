import { describe, it, expect } from "vitest";
import { PlainTextDecoder } from "../../src/cli/plain-text-decoder";

describe("PlainTextDecoder", () => {
  it("passes each line through as both a log line and agent text", () => {
    // Act
    const decoded = new PlainTextDecoder().decodeLine("===RALPH_RESULT_END===");

    // Assert
    expect(decoded).toEqual({ logLines: ["===RALPH_RESULT_END==="], agentText: "===RALPH_RESULT_END===" });
  });

  it("finishes with every line joined, blank lines included, and no usage or session", () => {
    // Arrange
    const decoder = new PlainTextDecoder();
    for (const line of ["one", "", "two"]) decoder.decodeLine(line);

    // Act & Assert
    expect(decoder.finish()).toEqual({ agentText: "one\n\ntwo" });
  });

  it("finishes with empty agent text when nothing was printed", () => {
    // Act & Assert
    expect(new PlainTextDecoder().finish()).toEqual({ agentText: "" });
  });
});
