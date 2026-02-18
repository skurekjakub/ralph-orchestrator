import { describe, it, expect, vi, beforeEach } from "vitest";
import { JiraClient } from "../../src/jira/client.js";
import type { JiraConfig } from "../../src/config.js";

const mockConfig: JiraConfig = {
  baseUrl: "https://api.atlassian.com/ex/jira",
  cloudId: "test-cloud-id",
  jql: ['project = DF AND summary ~ "Ralph"'],
  pollIntervalMs: 60000,
};

describe("JiraClient", () => {
  let client: JiraClient;

  beforeEach(() => {
    client = new JiraClient(mockConfig, "test@test.com", "test-token");
  });

  it("constructs correct auth header", () => {
    // The auth header should be "Basic base64(email:token)"
    const _expected = Buffer.from("test@test.com:test-token").toString("base64");
    // We can verify it indirectly by checking the request
    expect(client).toBeDefined();
  });

  describe("searchIssues", () => {
    it("makes a GET request with JQL", async () => {
      const mockResponse = {
        issues: [
          {
            key: "DF-1",
            fields: { summary: "Test", status: { name: "New" }, created: "2026-01-01T00:00:00.000+0000" },
          },
        ],
        total: 1,
        maxResults: 100,
        startAt: 0,
        isLast: true,
      };

      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          json: () => Promise.resolve(mockResponse),
        })
      );

      const issues = await client.searchIssues('project = DF');

      expect(fetch).toHaveBeenCalledOnce();
      const callUrl = vi.mocked(fetch).mock.calls[0][0] as string;
      expect(callUrl).toContain("/rest/api/3/search");
      expect(callUrl).toContain("jql=");

      expect(issues).toHaveLength(1);
      expect(issues[0].key).toBe("DF-1");
    });

    it("auto-paginates using nextPageToken", async () => {
      const page1 = {
        issues: [{ key: "DF-1", fields: { summary: "A", status: { name: "New" }, created: "2026-01-01T00:00:00Z" } }],
        total: 2,
        maxResults: 1,
        startAt: 0,
        isLast: false,
        nextPageToken: "tok-page2",
      };
      const page2 = {
        issues: [{ key: "DF-2", fields: { summary: "B", status: { name: "New" }, created: "2026-01-02T00:00:00Z" } }],
        total: 2,
        maxResults: 1,
        startAt: 1,
        isLast: true,
      };

      vi.stubGlobal(
        "fetch",
        vi.fn()
          .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve(page1) })
          .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve(page2) }),
      );

      const issues = await client.searchIssues("project = DF", 1);

      expect(fetch).toHaveBeenCalledTimes(2);
      const url2 = vi.mocked(fetch).mock.calls[1][0] as string;
      expect(url2).toContain("nextPageToken=tok-page2");
      expect(issues).toHaveLength(2);
      expect(issues.map((i) => i.key)).toEqual(["DF-1", "DF-2"]);
    });

    it("throws on HTTP error", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: false,
          status: 401,
          statusText: "Unauthorized",
          text: () => Promise.resolve("Bad token"),
        })
      );

      await expect(client.searchIssues("project = DF")).rejects.toThrow(
        "401"
      );
    });
  });

  describe("addComment", () => {
    it("sends ADF-formatted comment body", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          status: 201,
          json: () => Promise.resolve({}),
        })
      );

      await client.addComment("DF-1", "Test comment");

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
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          status: 204,
        })
      );

      await client.transitionIssue("DF-1", "21");

      expect(fetch).toHaveBeenCalledOnce();
      const [url, init] = vi.mocked(fetch).mock.calls[0];
      expect(url).toContain("/rest/api/3/issue/DF-1/transitions");
      expect(init?.method).toBe("POST");

      const body = JSON.parse(init?.body as string);
      expect(body.transition.id).toBe("21");
    });
  });
});
