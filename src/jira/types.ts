/** Pruned JIRA issue fields — only non-null values */
export interface JiraIssue {
  key: string;
  fields: {
    summary: string;
    description?: unknown; // ADF document
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
    [key: string]: unknown;
  };
}

export interface JiraSearchResponse {
  issues: JiraIssue[];
  total: number;
  maxResults: number;
  startAt: number;
}
