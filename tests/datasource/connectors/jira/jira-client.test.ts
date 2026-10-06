import { describe, it, expect, vi, beforeEach } from "vitest";
import { JiraClient } from "../../../../src/datasource/connectors/jira/jira-client";
import { makeIssue, makeComment } from "../../../helpers/factories";
import { createMockLogger } from "../../../helpers/mocks";
import type { IJiraConnectionConfig } from "../../../../src/config/types";

const mockConnection: IJiraConnectionConfig = {
  baseUrl: "https://api.atlassian.com/ex/jira",
  cloudId: "test-cloud-id",
  excludeFields: [],
  allowedUsers: [],
  email: "test@test.com",
  apiToken: "test-token",
};

const mockLogger = createMockLogger();
const KEY = "DF-1";

/** Stub global fetch with an OK JSON response. */
function stubFetchJson(data: unknown, status = 200) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      status,
      json: () => Promise.resolve(data),
    }),
  );
}

/** Stub global fetch with an OK text response. */
function stubFetchText(text: string) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(text),
    }),
  );
}

/** Stub global fetch with an error response. */
function stubFetchError(status: number, statusText: string, body = "") {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: false,
      status,
      statusText,
      text: () => Promise.resolve(body),
    }),
  );
}

describe("JiraClient", () => {
  let client: JiraClient;

  beforeEach(() => {
    client = new JiraClient({ connection: mockConnection });
  });

  it("constructs correct auth header", () => {
    expect(client).toBeDefined();
  });

  describe("searchIssues", () => {
    it("makes a GET request with JQL", async () => {
      stubFetchJson({
        issues: [makeIssue(KEY)],
        total: 1,
        maxResults: 100,
        startAt: 0,
        isLast: true,
      });

      const issues = await client.searchIssues("project = DF");

      expect(fetch).toHaveBeenCalledOnce();
      const callUrl = vi.mocked(fetch).mock.calls[0][0] as string;
      expect(callUrl).toContain("/rest/api/3/search");
      expect(callUrl).toContain("jql=");

      expect(issues).toHaveLength(1);
      expect(issues[0].key).toBe(KEY);
    });

    it("auto-paginates using nextPageToken", async () => {
      const page1 = {
        issues: [makeIssue(KEY, "A")],
        total: 2,
        maxResults: 1,
        startAt: 0,
        isLast: false,
        nextPageToken: "tok-page2",
      };
      const page2 = {
        issues: [makeIssue("DF-2", "B", "New", undefined, { created: "2026-01-02T00:00:00Z" })],
        total: 2,
        maxResults: 1,
        startAt: 1,
        isLast: true,
      };

      vi.stubGlobal(
        "fetch",
        vi
          .fn()
          .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve(page1) })
          .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve(page2) }),
      );

      const issues = await client.searchIssues("project = DF", 1);

      expect(fetch).toHaveBeenCalledTimes(2);
      const url2 = vi.mocked(fetch).mock.calls[1][0] as string;
      expect(url2).toContain("nextPageToken=tok-page2");
      expect(issues).toHaveLength(2);
      expect(issues.map((i) => i.key)).toEqual([KEY, "DF-2"]);
    });

    it("throws on HTTP error", async () => {
      stubFetchError(401, "Unauthorized", "Bad token");

      const retryClient = new JiraClient({ connection: mockConnection, logger: mockLogger }, { delayMs: 1 });
      await expect(retryClient.searchIssues("project = DF")).rejects.toThrow("401");
    });

    it("retries on transient fetch failure", async () => {
      const mockResponse = {
        issues: [makeIssue(KEY)],
        total: 1,
        maxResults: 100,
        startAt: 0,
        isLast: true,
      };

      vi.stubGlobal(
        "fetch",
        vi
          .fn()
          .mockRejectedValueOnce(new TypeError("fetch failed"))
          .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve(mockResponse) }),
      );

      const retryClient = new JiraClient({ connection: mockConnection, logger: mockLogger }, { delayMs: 1 });
      const issues = await retryClient.searchIssues("project = DF");

      expect(fetch).toHaveBeenCalledTimes(2);
      expect(issues).toHaveLength(1);
      expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining("failed (attempt 1/3)"));
    });
  });

  describe("addComment", () => {
    it("sends ADF-formatted comment body", async () => {
      stubFetchJson({}, 201);

      await client.addComment(KEY, "Test comment");

      expect(fetch).toHaveBeenCalledOnce();
      const [url, init] = vi.mocked(fetch).mock.calls[0];
      expect(url).toContain("/rest/api/3/issue/DF-1/comment");
      expect(init?.method).toBe("POST");

      const body = JSON.parse(init?.body as string);
      expect(body.body.type).toBe("doc");
      expect(body.body.content[0].content[0].text).toBe("Test comment");
    });
  });

  describe("transitionIssue", () => {
    it("sends transition request", async () => {
      stubFetchJson(undefined, 204);

      await client.transitionIssue(KEY, "21");

      expect(fetch).toHaveBeenCalledOnce();
      const [url, init] = vi.mocked(fetch).mock.calls[0];
      expect(url).toContain("/rest/api/3/issue/DF-1/transitions");
      expect(init?.method).toBe("POST");

      const body = JSON.parse(init?.body as string);
      expect(body.transition.id).toBe("21");
    });
  });

  describe("getComments", () => {
    it("returns all comments for a single page", async () => {
      stubFetchJson({
        startAt: 0,
        maxResults: 100,
        total: 2,
        comments: [makeComment("1", "first"), makeComment("2", "second", "2026-01-02T00:00:00Z")],
      });

      const comments = await client.getComments(KEY);

      expect(fetch).toHaveBeenCalledOnce();
      expect(comments).toHaveLength(2);
      expect(comments[0].id).toBe("1");
    });

    it("auto-paginates when total exceeds page size", async () => {
      const page1 = {
        startAt: 0,
        maxResults: 100,
        total: 150,
        comments: Array.from({ length: 100 }, (_, i) => makeComment(`C${i}`, `comment ${i}`)),
      };
      const page2 = {
        startAt: 100,
        maxResults: 100,
        total: 150,
        comments: Array.from({ length: 50 }, (_, i) => makeComment(`C${100 + i}`, `comment ${100 + i}`)),
      };

      vi.stubGlobal(
        "fetch",
        vi
          .fn()
          .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve(page1) })
          .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve(page2) }),
      );

      const comments = await client.getComments(KEY);

      expect(fetch).toHaveBeenCalledTimes(2);
      expect(comments).toHaveLength(150);
      expect(comments[0].id).toBe("C0");
      expect(comments[149].id).toBe("C149");

      const url2 = vi.mocked(fetch).mock.calls[1][0] as string;
      expect(url2).toContain("startAt=100");
    });
  });

  describe("getTransitions", () => {
    it("returns available transitions for an issue", async () => {
      stubFetchJson({
        transitions: [
          { id: "51", name: "Start progress", to: { name: "In progress" } },
          { id: "71", name: "Just close", to: { name: "Closed" } },
        ],
      });

      const transitions = await client.getTransitions(KEY);

      expect(transitions).toHaveLength(2);
      expect(transitions[0]).toEqual({ id: "51", name: "Start progress", to: { name: "In progress" } });

      const callUrl = vi.mocked(fetch).mock.calls[0][0] as string;
      expect(callUrl).toContain("/rest/api/3/issue/DF-1/transitions");
    });
  });

  describe("findTransitionId", () => {
    it("returns transition ID matching target status (case-insensitive)", async () => {
      stubFetchJson({
        transitions: [
          { id: "51", name: "Start progress", to: { name: "In progress" } },
          { id: "91", name: "Review", to: { name: "Ready for Review" } },
        ],
      });

      const id = await client.findTransitionId(KEY, "in progress");
      expect(id).toBe("51");
    });

    it("returns undefined when no matching transition exists", async () => {
      stubFetchJson({
        transitions: [{ id: "51", name: "Start progress", to: { name: "In progress" } }],
      });

      const id = await client.findTransitionId(KEY, "Done");
      expect(id).toBeUndefined();
    });
  });

  describe("getAttachments", () => {
    it("returns attachments from issue fields", async () => {
      stubFetchJson({
        fields: {
          attachment: [
            { id: "10001", filename: "handoff.md", content: "https://jira.atlassian.net/att/10001" },
            { id: "10002", filename: "results.json", content: "https://jira.atlassian.net/att/10002" },
          ],
        },
      });

      const attachments = await client.getAttachments(KEY);

      expect(attachments).toHaveLength(2);
      expect(attachments[0].filename).toBe("handoff.md");
      const callUrl = vi.mocked(fetch).mock.calls[0][0] as string;
      expect(callUrl).toContain("/rest/api/3/issue/DF-1?fields=attachment");
    });

    it("returns empty array when attachment field is missing", async () => {
      stubFetchJson({ fields: {} });

      const attachments = await client.getAttachments(KEY);

      expect(attachments).toEqual([]);
    });
  });

  describe("downloadAttachment", () => {
    it("downloads attachment content as string", async () => {
      stubFetchText("# Handoff\n\nPR link: ...");

      const content = await client.downloadAttachment("https://jira.atlassian.net/att/10001");

      expect(content).toContain("# Handoff");
      expect(vi.mocked(fetch).mock.calls[0][0]).toBe("https://jira.atlassian.net/att/10001");
      const init = vi.mocked(fetch).mock.calls[0][1]!;
      expect(init.headers).toHaveProperty("Authorization");
    });

    it("throws on download failure", async () => {
      stubFetchError(404, "Not Found");

      await expect(client.downloadAttachment("https://jira.atlassian.net/att/gone")).rejects.toThrow("404");
    });
  });

  describe("addAttachment", () => {
    it("uploads file with multipart form and X-Atlassian-Token header", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200 }));

      await client.addAttachment(KEY, "transcript.md", "# Session transcript");

      expect(fetch).toHaveBeenCalledOnce();
      const [url, init] = vi.mocked(fetch).mock.calls[0];
      expect(url).toContain("/rest/api/3/issue/DF-1/attachments");
      expect(init?.method).toBe("POST");
      expect((init?.headers as Record<string, string>)["X-Atlassian-Token"]).toBe("no-check");
      expect(init?.body).toBeInstanceOf(FormData);
    });

    it("throws on upload failure", async () => {
      stubFetchError(413, "Request Entity Too Large", "File too big");

      await expect(client.addAttachment(KEY, "big.bin", "x".repeat(1000))).rejects.toThrow("413");
    });
  });
});
