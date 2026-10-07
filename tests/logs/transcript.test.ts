import { describe, expect, it } from "vitest";
import { redactTranscript } from "../../src/logs/transcript";
import { createMockTextRedactor } from "../helpers/mocks";

describe("redactTranscript", () => {
  it("joins the lines as Markdown and fences each quoted text", async () => {
    // Arrange
    const lines = ["# T", "", { quote: "ls -la", maxChars: 100, info: "json" }, "", "done"];

    // Act
    const markdown = await redactTranscript(lines, createMockTextRedactor());

    // Assert
    expect(markdown).toBe("# T\n\n```json\nls -la\n```\n\ndone");
  });

  it("cuts a quoted text only after redacting it, so a secret across the cut leaves no prefix", async () => {
    // Arrange
    const quote = `${"x".repeat(8)}SECRET${"y".repeat(10)}`;

    // Act
    const markdown = await redactTranscript([{ quote, maxChars: 11, info: "text" }], createMockTextRedactor());

    // Assert
    expect(markdown).toBe("```text\nxxxxxxxx[RE…\n```");
    expect(markdown).not.toContain("SEC");
  });

  it("redacts the whole transcript in one batch, each run of plain lines as one text", async () => {
    // Arrange
    const redactor = createMockTextRedactor();
    const lines = ["a", "b", { quote: "q", maxChars: 10, info: "" }, "c"];

    // Act
    await redactTranscript(lines, redactor);

    // Assert
    expect(redactor.redactEach).toHaveBeenCalledExactlyOnceWith(["a\nb", "q", "c"]);
    expect(redactor.redact).not.toHaveBeenCalled();
  });

  it("fences a quoted text with a fence longer than any backtick run in it", async () => {
    // Act
    const markdown = await redactTranscript(
      [{ quote: "a ```` fence", maxChars: 100, info: "text" }],
      createMockTextRedactor(),
    );

    // Assert
    expect(markdown).toBe("`````text\na ```` fence\n`````");
  });

  it("throws when the redaction fails", async () => {
    // Arrange
    const redactor = createMockTextRedactor();
    redactor.redactEach.mockRejectedValue(new Error("perl: not found"));

    // Act & Assert
    await expect(redactTranscript(["# T"], redactor)).rejects.toThrow("perl: not found");
  });
});
