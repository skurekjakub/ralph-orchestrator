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
    /** ISO-8601 creation timestamp (e.g. `2026-01-15T10:30:00.000+0000`). */
    created: string;
    /** ISO-8601 last-updated timestamp (set on any field/comment/transition change). */
    updated?: string;
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
  /** Token-based pagination cursor (v3 search/jql endpoint). */
  nextPageToken?: string;
  /** Whether this is the last page of results. */
  isLast?: boolean;
}

/** A single JIRA issue comment from the `/rest/api/3/issue/{key}/comment` endpoint. */
export interface JiraComment {
  id: string;
  author: {
    /** Immutable Atlassian account ID (e.g. `5b10ac8d...`). Stable across display name changes. */
    accountId: string;
    displayName: string;
  };
  /** ADF body — extract text for prompt inclusion. */
  body: unknown;
  created: string;
}

/** Paginated comment response from the JIRA REST API. */
export interface JiraCommentResponse {
  startAt: number;
  maxResults: number;
  total: number;
  comments: JiraComment[];
}

/** A single JIRA workflow transition available for an issue in its current status. */
export interface JiraTransition {
  id: string;
  name: string;
  to: { name: string };
}

/** Response shape for `GET /rest/api/3/issue/{key}/transitions`. */
export interface JiraTransitionsResponse {
  transitions: JiraTransition[];
}

/** A single JIRA attachment from the issue's `fields.attachment` array. */
export interface JiraAttachment {
  id: string;
  filename: string;
  /** Direct download URL (requires auth). */
  content: string;
  created: string;
}
