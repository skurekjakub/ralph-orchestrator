import type { JiraConfig } from "../config.js";
import type { JiraIssue, JiraSearchResponse } from "./types.js";

export class JiraClient {
  private baseUrl: string;
  private authHeader: string;

  constructor(
    config: JiraConfig,
    private email: string,
    private apiToken: string
  ) {
    // Cloud API: https://api.atlassian.com/ex/jira/{cloudId}
    const base = config.baseUrl.replace(/\/+$/, "");
    this.baseUrl = `${base}/${config.cloudId}`;
    this.authHeader =
      "Basic " +
      Buffer.from(`${this.email}:${this.apiToken}`).toString("base64");
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const res = await fetch(url, {
      method,
      headers: {
        Authorization: this.authHeader,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(
        `JIRA API ${method} ${path} failed: ${res.status} ${res.statusText} — ${text}`
      );
    }

    // Some endpoints return 204 with no body
    if (res.status === 204) return undefined as T;

    return res.json() as Promise<T>;
  }

  /** Search issues using JQL */
  async searchIssues(jql: string, maxResults = 20): Promise<JiraIssue[]> {
    const params = new URLSearchParams({
      jql,
      maxResults: String(maxResults),
      fields: "*all",
    });
    const data = await this.request<JiraSearchResponse>(
      "GET",
      `/rest/api/3/search?${params}`
    );
    return data.issues;
  }

  /** Get a single issue with full details */
  async getIssue(key: string): Promise<JiraIssue> {
    return this.request<JiraIssue>("GET", `/rest/api/3/issue/${key}`);
  }

  /** Add a comment to an issue */
  async addComment(key: string, bodyText: string): Promise<void> {
    await this.request("POST", `/rest/api/3/issue/${key}/comment`, {
      body: {
        version: 1,
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: bodyText }],
          },
        ],
      },
    });
  }

  /** Transition an issue to a new status */
  async transitionIssue(key: string, transitionId: string): Promise<void> {
    await this.request("POST", `/rest/api/3/issue/${key}/transitions`, {
      transition: { id: transitionId },
    });
  }
}
