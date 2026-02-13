import { describe, it, expect, vi, beforeEach } from "vitest";
import type { JiraIssue } from "../src/jira/types.js";

// We can't easily test the full ContainerManager (it shells out to docker),
// but we can test the core logic: prompt building, result parsing, env passing.

// ── Prompt building ──────────────────────────────────────

function buildPrompt(issue: JiraIssue): string {
  const parts: string[] = [
    `JIRA Issue: ${issue.key}`,
    `Title: ${issue.fields.summary}`,
  ];

  if (issue.fields.description) {
    const descStr =
      typeof issue.fields.description === "string"
        ? issue.fields.description
        : JSON.stringify(issue.fields.description, null, 2);
    parts.push(`Description:\n${descStr}`);
  }

  if (issue.fields.labels && issue.fields.labels.length > 0) {
    parts.push(`Labels: ${issue.fields.labels.join(", ")}`);
  }

  if (issue.fields.components && issue.fields.components.length > 0) {
    parts.push(
      `Components: ${issue.fields.components.map((c) => c.name).join(", ")}`
    );
  }

  if (issue.fields.priority) {
    parts.push(`Priority: ${issue.fields.priority.name}`);
  }

  for (const [key, value] of Object.entries(issue.fields)) {
    if (
      key.startsWith("customfield_") &&
      value &&
      typeof value === "string" &&
      value.length > 10
    ) {
      parts.push(`${key}: ${value}`);
    }
  }

  return parts.join("\n\n");
}

describe("ContainerManager prompt building", () => {
  it("builds basic prompt with key and summary", () => {
    const issue: JiraIssue = {
      key: "DF-2704",
      fields: { summary: "Add custom module docs", status: { name: "New" } },
    };

    const prompt = buildPrompt(issue);
    expect(prompt).toContain("JIRA Issue: DF-2704");
    expect(prompt).toContain("Title: Add custom module docs");
  });

  it("includes string description", () => {
    const issue: JiraIssue = {
      key: "DF-1",
      fields: {
        summary: "Test",
        status: { name: "New" },
        description: "Some plain text description",
      },
    };

    const prompt = buildPrompt(issue);
    expect(prompt).toContain("Description:\nSome plain text description");
  });

  it("serializes ADF description as JSON", () => {
    const adf = {
      type: "doc",
      version: 1,
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Hello" }] },
      ],
    };
    const issue: JiraIssue = {
      key: "DF-1",
      fields: {
        summary: "Test",
        status: { name: "New" },
        description: adf,
      },
    };

    const prompt = buildPrompt(issue);
    expect(prompt).toContain("Description:");
    expect(prompt).toContain('"type": "doc"');
    expect(prompt).toContain('"text": "Hello"');
  });

  it("includes labels, components, and priority", () => {
    const issue: JiraIssue = {
      key: "DF-1",
      fields: {
        summary: "Test",
        status: { name: "New" },
        labels: ["ralph-auto", "docs"],
        components: [{ name: "SaaS" }, { name: "On-Premises" }],
        priority: { name: "High" },
      },
    };

    const prompt = buildPrompt(issue);
    expect(prompt).toContain("Labels: ralph-auto, docs");
    expect(prompt).toContain("Components: SaaS, On-Premises");
    expect(prompt).toContain("Priority: High");
  });

  it("includes long custom fields", () => {
    const issue: JiraIssue = {
      key: "DF-1",
      fields: {
        summary: "Test",
        status: { name: "New" },
        customfield_10001: "This is a long acceptance criteria string",
        customfield_10002: "short", // too short, should be excluded
      },
    };

    const prompt = buildPrompt(issue);
    expect(prompt).toContain("customfield_10001: This is a long acceptance criteria string");
    expect(prompt).not.toContain("customfield_10002");
  });

  it("omits missing optional fields", () => {
    const issue: JiraIssue = {
      key: "DF-1",
      fields: { summary: "Test", status: { name: "New" } },
    };

    const prompt = buildPrompt(issue);
    expect(prompt).not.toContain("Labels:");
    expect(prompt).not.toContain("Components:");
    expect(prompt).not.toContain("Priority:");
    expect(prompt).not.toContain("Description:");
  });
});

// ── Result parsing ───────────────────────────────────────

function parseResultBlock(stdout: string) {
  const resultBlock = stdout.match(
    /===RALPH_RESULT_START===([\s\S]*?)===RALPH_RESULT_END===/
  );

  let prUrl: string | undefined;
  let agentStatus: string | undefined;

  if (resultBlock) {
    const prMatch = resultBlock[1].match(/PR_URL:\s*(\S+)/);
    if (prMatch && prMatch[1] !== "none") {
      prUrl = prMatch[1];
    }
    const statusMatch = resultBlock[1].match(/STATUS:\s*(\S+)/);
    if (statusMatch) {
      agentStatus = statusMatch[1];
    }
  } else {
    const prUrlMatch = stdout.match(
      /Pull Request:\s*(https?:\/\/\S+)/i
    );
    prUrl = prUrlMatch?.[1];
  }

  return { prUrl, agentStatus };
}

describe("ContainerManager result parsing", () => {
  it("extracts PR URL and status from structured block", () => {
    const stdout = `
Some other output...
===RALPH_RESULT_START===
JIRA_KEY: DF-2704
STATUS: completed
BRANCH: ralph/df-2704-custom-modules
PR_URL: https://dev.azure.com/org/project/_git/repo/pullrequest/123
HANDOFF: resources/chats/DF-2704/handoff.md
SUMMARY: Added custom module documentation
===RALPH_RESULT_END===
`;

    const { prUrl, agentStatus } = parseResultBlock(stdout);
    expect(prUrl).toBe("https://dev.azure.com/org/project/_git/repo/pullrequest/123");
    expect(agentStatus).toBe("completed");
  });

  it("handles 'none' PR URL", () => {
    const stdout = `
===RALPH_RESULT_START===
STATUS: partial
PR_URL: none
===RALPH_RESULT_END===
`;

    const { prUrl, agentStatus } = parseResultBlock(stdout);
    expect(prUrl).toBeUndefined();
    expect(agentStatus).toBe("partial");
  });

  it("falls back to loose PR URL regex when no structured block", () => {
    const stdout = "Pull Request: https://dev.azure.com/pr/456";

    const { prUrl, agentStatus } = parseResultBlock(stdout);
    expect(prUrl).toBe("https://dev.azure.com/pr/456");
    expect(agentStatus).toBeUndefined();
  });

  it("returns undefined for both when no matches", () => {
    const { prUrl, agentStatus } = parseResultBlock("random output");
    expect(prUrl).toBeUndefined();
    expect(agentStatus).toBeUndefined();
  });

  it("handles blocked status", () => {
    const stdout = `
===RALPH_RESULT_START===
STATUS: blocked
PR_URL: none
SUMMARY: Git conflict on master
===RALPH_RESULT_END===
`;

    const { agentStatus } = parseResultBlock(stdout);
    expect(agentStatus).toBe("blocked");
  });
});

// ── Copilot CLI args ─────────────────────────────────────

describe("ContainerManager copilot CLI args", () => {
  it("includes --model claude-opus-4.6 in the exec args", async () => {
    // We import and read the source to verify the model flag is present
    // This is a snapshot test to catch accidental removal
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const source = readFileSync(
      resolve(import.meta.dirname, "../src/container/manager.ts"),
      "utf-8"
    );

    expect(source).toContain('"--model"');
    expect(source).toContain('"claude-opus-4.6"');
  });

  it("passes all required env vars via --remote-env", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const source = readFileSync(
      resolve(import.meta.dirname, "../src/container/manager.ts"),
      "utf-8"
    );

    const requiredEnvVars = [
      "GH_TOKEN",
      "ADO_PAT_DOCS",
      "ADO_MCP_AUTH_TOKEN",
      "ADO_PAT_XPERIENCE",
      "JIRA_PAT",
      "JIRA_EMAIL",
      "JIRA_BASE_URL",
      "JIRA_CLOUD_ID",
    ];

    for (const envVar of requiredEnvVars) {
      expect(source).toContain(`\`${envVar}=`);
    }
  });

  it("includes --hooks-config flag for audit logging", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const source = readFileSync(
      resolve(import.meta.dirname, "../src/container/manager.ts"),
      "utf-8"
    );

    expect(source).toContain('"--hooks-config"');
    expect(source).toContain("ralph-audit.json");
  });

  it("uses --remove-orphans in docker compose down", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const source = readFileSync(
      resolve(import.meta.dirname, "../src/container/manager.ts"),
      "utf-8"
    );

    expect(source).toContain('"--remove-orphans"');
  });

  it("streams build output to logger", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const source = readFileSync(
      resolve(import.meta.dirname, "../src/container/manager.ts"),
      "utf-8"
    );

    // start() method should pipe stdout/stderr with [build] prefix
    expect(source).toContain("[build]");
    expect(source).toContain("proc.stdout");
    expect(source).toContain("proc.stderr");
  });
});
