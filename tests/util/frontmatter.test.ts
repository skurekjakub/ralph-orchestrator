import { describe, it, expect } from "vitest";
import {
  FrontmatterError,
  parseFrontmatter,
  splitFrontmatter,
  yamlScalar,
  yamlSingleQuoted,
} from "../../src/util/frontmatter";

describe("splitFrontmatter", () => {
  it("splits the block between the fences from the body, keeping the body verbatim", () => {
    // Act
    const document = splitFrontmatter("---\nname: a\nmodel: opus\n---\n\n# Body\n");

    // Assert
    expect(document).toEqual({ frontmatter: "name: a\nmodel: opus\n", body: "\n# Body\n" });
  });

  it("accepts CRLF line endings and a file that ends at the closing fence", () => {
    // Act
    const document = splitFrontmatter("---\r\nname: a\r\n---");

    // Assert
    expect(document).toEqual({ frontmatter: "name: a\n", body: "" });
  });

  it("accepts an empty block", () => {
    // Act & Assert
    expect(splitFrontmatter("---\n---\nbody")).toEqual({ frontmatter: "", body: "body" });
  });

  it("throws when the file does not open with a fence", () => {
    // Act & Assert
    expect(() => splitFrontmatter("# Agent\n")).toThrow(FrontmatterError);
  });

  it("throws when the block is never closed", () => {
    // Act & Assert
    expect(() => splitFrontmatter("---\nname: a\n")).toThrow(/never closed/);
  });
});

describe("parseFrontmatter", () => {
  it("reads plain, quoted, numeric and boolean scalars", () => {
    // Act
    const result = parseFrontmatter(
      "name: ralph\ndescription: 'It''s Ralph — routes: all'\ntitle: \"a \\\"b\\\"\"\nmaxTurns: 300\nflag: false\n",
    );

    // Assert
    expect(result).toEqual({
      name: "ralph",
      description: "It's Ralph — routes: all",
      title: 'a "b"',
      maxTurns: 300,
      flag: false,
    });
  });

  it("reads flow sequences of plain and quoted strings", () => {
    // Act
    const result = parseFrontmatter("a: [x, 'y z', \"w, v\"]\nb: []\n");

    // Assert
    expect(result).toEqual({ a: ["x", "y z", "w, v"], b: [] });
  });

  it("reads one level of nested keys and ignores comments and blank lines", () => {
    // Act
    const result = parseFrontmatter("# comment\ncopilot:\n  model: gpt-5.4\n  tools: [a]\n\nname: x\n");

    // Assert
    expect(result).toEqual({ copilot: { model: "gpt-5.4", tools: ["a"] }, name: "x" });
  });

  it("keeps model ids with dots and brackets as strings", () => {
    // Act & Assert
    expect(parseFrontmatter("a: claude-opus-4.6\nb: opus[1m]\n")).toEqual({ a: "claude-opus-4.6", b: "opus[1m]" });
  });

  it.each([
    ["a block sequence", "a:\n- x\n", /line 2/],
    ["a duplicate key", "a: 1\na: 2\n", /duplicate key "a"/],
    ["a duplicate nested key", "c:\n  m: 1\n  m: 2\n", /duplicate key "c.m"/],
    ["an indented line without a parent", "  a: 1\n", /without a parent/],
    ["deeper nesting", "c:\n  d:\n", /line 2/],
    ["a tab", "a:\tb\n", /tabs/],
    ["an unterminated single quote", "a: 'oops\n", /unterminated single-quoted/],
    ["an unterminated double quote", 'a: "oops\n', /unterminated double-quoted/],
    ["a flow sequence over several lines", "a: [x,\n", /same line/],
    ["a trailing comma in a sequence", "a: [x, ]\n", /empty item|trailing/],
    ["a nested collection in a sequence", "a: [[x]]\n", /nested collections/],
    ["text after a quoted string", "a: 'x' y\n", /after a quoted string/],
    ["a block scalar", "a: |\n", /not a plain YAML string/],
    ["an anchor", "a: &x y\n", /not a plain YAML string/],
    ["a plain value YAML reads as null", "a: null\n", /non-string/],
    ["a plain value YAML reads as a float", "a: 1.5\n", /non-string/],
    ["a plain value YAML reads as a hex number", "a: 0x1F\n", /non-string/],
    ["a plain value YAML 1.1 reads as a boolean", "a: yes\n", /non-string/],
    ["a plain value YAML reads as a timestamp", "a: 2026-01-01\n", /non-string/],
    ["a list item YAML reads as a number", "a: [x, 1]\n", /non-string/],
    ["a plain value containing ': '", "a: b: c\n", /not a plain YAML string/],
    ["a line without a key", "just text\n", /expected `key: value`/],
  ])("rejects %s", (_label, text, message) => {
    // Act & Assert
    expect(() => parseFrontmatter(text)).toThrow(message);
  });

  it("names the offending line", () => {
    // Act & Assert
    expect(() => parseFrontmatter("a: 1\nb: [x\n")).toThrow(/^frontmatter line 2:/);
  });
});

describe("yamlSingleQuoted", () => {
  it("doubles embedded quotes", () => {
    // Act & Assert
    expect(yamlSingleQuoted("It's")).toBe("'It''s'");
  });

  it("reads back as the same string", () => {
    // Arrange
    const value = "Ralph's orchestrator — routes: researcher, writer # and more";

    // Act
    const parsed = parseFrontmatter(`a: ${yamlSingleQuoted(value)}\n`);

    // Assert
    expect(parsed.a).toBe(value);
  });
});

describe("yamlScalar", () => {
  it("leaves identifiers and model ids plain", () => {
    // Act & Assert
    expect([yamlScalar("ralph-coder"), yamlScalar("opus[1m]"), yamlScalar("claude-opus-5-5")]).toEqual([
      "ralph-coder",
      "opus[1m]",
      "claude-opus-5-5",
    ]);
  });

  it("quotes values YAML would read as something else", () => {
    // Act & Assert
    expect([yamlScalar("true"), yamlScalar("4.6"), yamlScalar("-x"), yamlScalar("a b")]).toEqual([
      "'true'",
      "'4.6'",
      "'-x'",
      "'a b'",
    ]);
  });
});
