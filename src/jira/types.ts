/**
 * Pruned JIRA issue shape returned by the REST API v3 `/search/jql` endpoint.
 *
 * Only non-null fields are typed; custom fields appear as dynamic `[key: string]: unknown`.
 */
export interface JiraIssue {
  /** JIRA issue key (e.g. `DF-2759`). */
  key: string;
  fields: {
    /** Issue title / summary. */
    summary: string;
    /** Rich description in Atlassian Document Format (ADF), or a plain string. */
    description?: unknown;
    /** Current workflow status. */
    status: {
      name: string;
    };
    issuetype?: {
      name: string;
    };
    priority?: {
      name: string;
    };
    labels?: string[];
    components?: Array<{ name: string }>;
    /** Catch-all for custom fields (acceptance criteria, story points, etc.). */
    [key: string]: unknown;
  };
}

/** Shape of the JIRA v3 `/rest/api/3/search/jql` response body. */
export interface JiraSearchResponse {
  issues: JiraIssue[];
  total: number;
  maxResults: number;
  startAt: number;
}
