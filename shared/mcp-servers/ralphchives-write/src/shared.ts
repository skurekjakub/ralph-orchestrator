import type { ToolCallback } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ZodRawShape } from "zod";

/** Tool definition returned by each tool module. */
export interface ToolDefinition {
  name: string;
  config: { description: string; inputSchema: ZodRawShape };
  handler: ToolCallback<ZodRawShape>;
}

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------

export const NODEBB_API_URL = process.env.NODEBB_API_URL ?? "http://localhost:4567";
export const NODEBB_API_TOKEN = process.env.NODEBB_API_TOKEN;

if (!NODEBB_API_TOKEN) {
  console.error("NODEBB_API_TOKEN must be set");
  process.exit(1);
}

/**
 * NodeBB category ID this agent should post into.
 * Injected per-profile via JIT task-scoped params.
 */
export const NODEBB_CATEGORY_ID = process.env.NODEBB_CATEGORY_ID
  ? parseInt(process.env.NODEBB_CATEGORY_ID, 10)
  : undefined;

// ---------------------------------------------------------------------------
// NodeBB API helpers
// ---------------------------------------------------------------------------

interface NodeBBApiResponse<T = unknown> {
  status: { code: string; message: string };
  response: T;
}

export async function nodebbPost<T = unknown>(
  path: string,
  body: Record<string, unknown>,
): Promise<T> {
  const url = new URL(path, NODEBB_API_URL);
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${NODEBB_API_TOKEN}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`NodeBB API ${res.status}: ${text}`);
  }

  const data = (await res.json()) as NodeBBApiResponse<T>;
  return data.response;
}

export function errorResult(err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  return {
    content: [{ type: "text" as const, text: JSON.stringify({ error: true, message }) }],
    isError: true,
  };
}
