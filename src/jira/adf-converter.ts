/**
 * Converts Atlassian Document Format (ADF) node trees to Markdown.
 *
 * Based on [adf-to-md](https://github.com/julianlam/adf-to-md) by Julian Lam (ISC license).
 * Inlined to avoid a transitive eslint dependency in the published package.
 *
 * @module
 */

interface AdfNode {
  type: string;
  text?: string;
  attrs?: Record<string, unknown>;
  marks?: AdfMark[];
  content?: AdfNode[];
}

interface AdfMark {
  type: string;
  attrs?: Record<string, unknown>;
}

/**
 * Convert an ADF document node to Markdown text.
 *
 * Handles all standard ADF node types: paragraphs, headings, lists,
 * code blocks, tables, blockquotes, inline cards (JIRA issue links),
 * and text marks (bold, italic, code, link, strikethrough).
 *
 * @returns Markdown string, or `""` if the input is not a valid ADF doc node.
 */
export function extractAdfText(node: unknown): string {
  if (!node || typeof node !== "object") return "";
  const n = node as AdfNode;
  if (n.type !== "doc" || !Array.isArray(n.content)) return "";
  return convertNode(n);
}

function convertNode(this: AdfNode | void, node: AdfNode): string {
  const content = node.content ?? [];

  switch (node.type) {
    case "doc":
      return content.map((c) => convertNode(c)).join("\n\n");

    case "text":
      return convertMarks(node);

    case "paragraph":
      return content.map((c) => convertNode(c)).join("");

    case "heading":
      return `${"#".repeat(Number(node.attrs?.level) || 1)} ${content.map((c) => convertNode(c)).join("")}`;

    case "hardBreak":
      return "\n";

    case "inlineCard":
    case "blockCard":
    case "embedCard":
      return node.attrs?.url ? `[${node.attrs.url}](${node.attrs.url})` : "";

    case "blockquote":
      return `> ${content.map((c) => convertNode(c)).join("\n> ")}`;

    case "bulletList":
    case "orderedList": {
      const parent = { ...node, attrs: { ...node.attrs, order: Number(node.attrs?.order) || 1 } };
      return content.map((sub) => {
        const converted = convertNode.call(parent, sub);
        if (node.type === "orderedList") parent.attrs.order++;
        return converted;
      }).join("\n");
    }

    case "listItem": {
      const parentThis = this as AdfNode | undefined;
      const order = parentThis?.attrs?.order ?? 1;
      const symbol = parentThis?.type === "orderedList" ? `${order as number}.` : "*";
      return `  ${symbol} ${content.map((c) => convertNode(c).trimEnd()).join(" ")}`;
    }

    case "codeBlock": {
      const language = node.attrs?.language ? ` ${node.attrs.language}` : "";
      return `\`\`\`${language}\n${content.map((c) => convertNode(c)).join("\n")}\n\`\`\``;
    }

    case "rule":
      return "\n\n---\n";

    case "emoji":
      return String(node.attrs?.shortName ?? "");

    case "table":
      return content.map((c) => convertNode(c)).join("");

    case "tableRow": {
      let output = "|";
      let thCount = 0;
      output += content.map((sub) => {
        thCount += sub.type === "tableHeader" ? 1 : 0;
        return convertNode(sub);
      }).join("");
      output += thCount ? `\n${"|:-:".repeat(thCount)}|\n` : "\n";
      return output;
    }

    case "tableHeader":
      return `${content.map((c) => convertNode(c)).join("")}|`;

    case "tableCell":
      return `${content.map((c) => convertNode(c)).join("")}|`;

    default:
      return "";
  }
}

function convertMarks(node: AdfNode): string {
  if (!node.marks || !Array.isArray(node.marks)) return node.text ?? "";

  return node.marks.reduce((converted: string, mark: AdfMark) => {
    switch (mark.type) {
      case "code":
        return `\`${converted}\``;
      case "em":
        return `_${converted}_`;
      case "link":
        return `[${converted}](${mark.attrs?.href ?? ""})`;
      case "strike":
        return `~~${converted}~~`;
      case "strong":
        return `**${converted}**`;
      default:
        return converted;
    }
  }, node.text ?? "");
}
