import { describe, it, expect } from "vitest";
import { extractAdfText } from "../../../../src/datasource/connectors/jira/adf-converter";

/** Shorthand for building an ADF doc with given block-level children. */
function doc(...content: object[]) {
  return { type: "doc", version: 1, content };
}

function p(...content: object[]) {
  return { type: "paragraph", content };
}

function text(t: string, marks?: object[]) {
  return { type: "text", text: t, ...(marks ? { marks } : {}) };
}

describe("extractAdfText", () => {
  it("returns empty string for null/undefined", () => {
    expect(extractAdfText(null)).toBe("");
    expect(extractAdfText(undefined)).toBe("");
  });

  it("returns empty string for non-doc nodes", () => {
    expect(extractAdfText({ type: "paragraph", content: [] })).toBe("");
    expect(extractAdfText({ type: "text", text: "hello" })).toBe("");
  });

  it("returns empty string for doc without content array", () => {
    expect(extractAdfText({ type: "doc" })).toBe("");
  });

  it("extracts plain text from paragraphs", () => {
    const result = extractAdfText(doc(p(text("Hello world"))));
    expect(result).toBe("Hello world");
  });

  it("joins multiple paragraphs with double newline", () => {
    const result = extractAdfText(doc(p(text("First")), p(text("Second"))));
    expect(result).toBe("First\n\nSecond");
  });

  it("converts headings with proper level", () => {
    const result = extractAdfText(doc({ type: "heading", attrs: { level: 2 }, content: [text("Title")] }));
    expect(result).toBe("## Title");
  });

  it("renders inline cards as markdown links", () => {
    const result = extractAdfText(
      doc(p(text("See "), { type: "inlineCard", attrs: { url: "https://jira.example.com/browse/DOC-123" } })),
    );
    expect(result).toBe("See [https://jira.example.com/browse/DOC-123](https://jira.example.com/browse/DOC-123)");
  });

  it("renders blockCard and embedCard as links", () => {
    const result = extractAdfText(
      doc(
        { type: "blockCard", attrs: { url: "https://example.com" } },
        { type: "embedCard", attrs: { url: "https://embed.com" } },
      ),
    );
    expect(result).toBe("[https://example.com](https://example.com)\n\n[https://embed.com](https://embed.com)");
  });

  it("renders bold text marks", () => {
    const result = extractAdfText(doc(p(text("bold", [{ type: "strong" }]))));
    expect(result).toBe("**bold**");
  });

  it("renders italic text marks", () => {
    const result = extractAdfText(doc(p(text("italic", [{ type: "em" }]))));
    expect(result).toBe("_italic_");
  });

  it("renders code text marks", () => {
    const result = extractAdfText(doc(p(text("code", [{ type: "code" }]))));
    expect(result).toBe("`code`");
  });

  it("renders strikethrough text marks", () => {
    const result = extractAdfText(doc(p(text("deleted", [{ type: "strike" }]))));
    expect(result).toBe("~~deleted~~");
  });

  it("renders link marks as markdown links", () => {
    const result = extractAdfText(
      doc(p(text("click here", [{ type: "link", attrs: { href: "https://example.com" } }]))),
    );
    expect(result).toBe("[click here](https://example.com)");
  });

  it("stacks multiple marks on the same text", () => {
    const result = extractAdfText(doc(p(text("important", [{ type: "strong" }, { type: "em" }]))));
    expect(result).toBe("_**important**_");
  });

  it("renders bullet lists", () => {
    const result = extractAdfText(
      doc({
        type: "bulletList",
        content: [
          { type: "listItem", content: [p(text("Item A"))] },
          { type: "listItem", content: [p(text("Item B"))] },
        ],
      }),
    );
    expect(result).toBe("  * Item A\n  * Item B");
  });

  it("renders ordered lists with correct numbering", () => {
    const result = extractAdfText(
      doc({
        type: "orderedList",
        content: [
          { type: "listItem", content: [p(text("First"))] },
          { type: "listItem", content: [p(text("Second"))] },
          { type: "listItem", content: [p(text("Third"))] },
        ],
      }),
    );
    expect(result).toBe("  1. First\n  2. Second\n  3. Third");
  });

  it("renders code blocks with language", () => {
    const result = extractAdfText(
      doc({
        type: "codeBlock",
        attrs: { language: "typescript" },
        content: [text("const x = 1;")],
      }),
    );
    expect(result).toBe("``` typescript\nconst x = 1;\n```");
  });

  it("renders code blocks without language", () => {
    const result = extractAdfText(
      doc({
        type: "codeBlock",
        content: [text("plain code")],
      }),
    );
    expect(result).toBe("```\nplain code\n```");
  });

  it("renders blockquotes", () => {
    const result = extractAdfText(
      doc({
        type: "blockquote",
        content: [p(text("A quote"))],
      }),
    );
    expect(result).toBe("> A quote");
  });

  it("renders horizontal rules", () => {
    const result = extractAdfText(doc(p(text("before")), { type: "rule" }, p(text("after"))));
    expect(result).toBe("before\n\n\n\n---\n\n\nafter");
  });

  it("renders emojis by shortName", () => {
    const result = extractAdfText(doc(p(text("Hello "), { type: "emoji", attrs: { shortName: ":wave:" } })));
    expect(result).toBe("Hello :wave:");
  });

  it("renders hard breaks as newlines", () => {
    const result = extractAdfText(doc(p(text("Line 1"), { type: "hardBreak" }, text("Line 2"))));
    expect(result).toBe("Line 1\nLine 2");
  });

  it("renders tables with headers", () => {
    const result = extractAdfText(
      doc({
        type: "table",
        content: [
          {
            type: "tableRow",
            content: [
              { type: "tableHeader", content: [p(text("Name"))] },
              { type: "tableHeader", content: [p(text("Value"))] },
            ],
          },
          {
            type: "tableRow",
            content: [
              { type: "tableCell", content: [p(text("foo"))] },
              { type: "tableCell", content: [p(text("bar"))] },
            ],
          },
        ],
      }),
    );
    expect(result).toContain("|Name|Value|");
    expect(result).toContain("|foo|bar|");
  });

  it("handles empty doc", () => {
    expect(extractAdfText(doc())).toBe("");
  });

  it("skips unknown node types gracefully", () => {
    const result = extractAdfText(doc(p(text("Hello")), { type: "unknownCustomNode", content: [] }, p(text("World"))));
    expect(result).toBe("Hello\n\n\n\nWorld");
  });

  it("handles a realistic JIRA description", () => {
    const adf = doc(
      p({ type: "inlineCard", attrs: { url: "https://jira.example.com/browse/KX-123" } }),
      p(text("The full changes can be found under "), text("fe3797f", [{ type: "code" }]), text(" in the repo.")),
      p(text("Notes")),
      {
        type: "bulletList",
        content: [
          { type: "listItem", content: [p(text("First note"))] },
          { type: "listItem", content: [p(text("Second note"))] },
        ],
      },
    );

    const result = extractAdfText(adf);
    expect(result).toContain("[https://jira.example.com/browse/KX-123]");
    expect(result).toContain("`fe3797f`");
    expect(result).toContain("* First note");
    expect(result).toContain("* Second note");
  });
});
