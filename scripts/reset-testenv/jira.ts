import type { JiraEnv } from "./types.js";

const DEFAULT_DESCRIPTION = {
  version: 1,
  type: "doc",
  content: [
    {
      type: "paragraph",
      content: [
        {
          type: "text",
          text: 'Add a short section to the bottom of the reusable field schemas page (src/_documentation/_documentation/developers-and-admins/development/content-types/reusable-field-schemas.md). The section should mention that reusable field schemas cannot be nested inside other reusable field schemas, and that changes to a schema propagate to all content types that use it.',
        },
      ],
    },
  ],
};

function makeClient(env: JiraEnv) {
  const base = `https://api.atlassian.com/ex/jira/${env.cloudId}/rest/api/3`;
  const auth = "Basic " + Buffer.from(`${env.email}:${env.apiToken}`).toString("base64");

  return async function request(method: string, path: string, body?: unknown): Promise<Response> {
    const url = path.startsWith("http") ? path : `${base}${path}`;
    const res = await fetch(url, {
      method,
      headers: {
        Authorization: auth,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok && res.status !== 204) {
      const text = await res.text().catch(() => "");
      throw new Error(`${method} ${path} → ${res.status}: ${text}`);
    }
    return res;
  };
}

export async function fetchIssue(issueKey: string, env: JiraEnv) {
  const request = makeClient(env);
  const res = await request("GET", `/issue/${issueKey}?fields=status,comment,attachment,summary`);
  return res.json();
}

export async function deleteComments(issueKey: string, issue: any, env: JiraEnv) {
  const request = makeClient(env);
  const comments = issue.fields?.comment?.comments ?? [];
  if (comments.length === 0) {
    console.log("  ✓ No comments to delete");
    return;
  }
  console.log(`  Deleting ${comments.length} comments...`);
  for (const c of comments) {
    await request("DELETE", `/issue/${issueKey}/comment/${c.id}`);
    process.stdout.write(".");
  }
  console.log(" done");
}

export async function deleteAttachments(issueKey: string, issue: any, env: JiraEnv) {
  const request = makeClient(env);
  const attachments: any[] = issue.fields?.attachment ?? [];
  if (attachments.length === 0) {
    console.log("  ✓ No attachments to delete");
    return;
  }
  console.log(`  Deleting ${attachments.length} attachments...`);
  for (const a of attachments) {
    await request("DELETE", `/attachment/${a.id}`);
    process.stdout.write(".");
  }
  console.log(" done");
}

export async function resetFields(issueKey: string, env: JiraEnv) {
  const request = makeClient(env);
  console.log("  Setting summary and description...");
  await request("PUT", `/issue/${issueKey}`, {
    fields: {
      summary: `[Test] Ralph sandbox issue — ${issueKey}`,
      description: DEFAULT_DESCRIPTION,
    },
  });
  console.log("  ✓ Fields updated");
}

export async function transitionToToDo(issueKey: string, env: JiraEnv) {
  const request = makeClient(env);
  const res = await request("GET", `/issue/${issueKey}/transitions`);
  const data = (await res.json()) as { transitions: { id: string; name: string }[] };
  const todo = data.transitions.find((t) => t.name.toLowerCase() === "to do");

  if (!todo) {
    const available = data.transitions.map((t) => `${t.name} (${t.id})`).join(", ");
    console.log(`  ⚠ No "To Do" transition found. Available: ${available}`);
    console.log("  Issue may already be in \"To Do\" or the workflow doesn't allow this transition.");
    return;
  }

  console.log(`  Transitioning to "To Do" (id=${todo.id})...`);
  await request("POST", `/issue/${issueKey}/transitions`, { transition: { id: todo.id } });
  console.log("  ✓ Transitioned to To Do");
}
