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

/** If set, all tools return this message instead of executing. */
export let unavailableReason: string | undefined;

if (!NODEBB_API_TOKEN) {
  unavailableReason = "Ralphchives unavailable: NODEBB_API_TOKEN not configured";
}

/**
 * NodeBB category ID this agent should read from.
 * Resolved at startup from NODEBB_CATEGORY_NAME (via API lookup) or
 * NODEBB_CATEGORY_ID (direct numeric, backward compat).
 * Must call initCategoryId() before importing tool modules.
 */
export let NODEBB_CATEGORY_ID: number | undefined;

/**
 * Resolve NODEBB_CATEGORY_NAME → numeric cid via NodeBB API.
 * Falls back to NODEBB_CATEGORY_ID env var if set directly.
 * On failure, sets unavailableReason so tools return a graceful error.
 */
export async function initCategoryId(): Promise<void> {
  if (unavailableReason) return;

  if (process.env.NODEBB_CATEGORY_ID) {
    NODEBB_CATEGORY_ID = parseInt(process.env.NODEBB_CATEGORY_ID, 10);
    if (Number.isNaN(NODEBB_CATEGORY_ID)) {
      NODEBB_CATEGORY_ID = undefined;
      unavailableReason = `Ralphchives unavailable: NODEBB_CATEGORY_ID is not a valid number ("${process.env.NODEBB_CATEGORY_ID}")`;
    }
    return;
  }

  const name = process.env.NODEBB_CATEGORY_NAME;
  if (!name) {
    unavailableReason = "Ralphchives unavailable: neither NODEBB_CATEGORY_NAME nor NODEBB_CATEGORY_ID configured";
    return;
  }

  try {
    const url = new URL("/api/categories", NODEBB_API_URL);
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${NODEBB_API_TOKEN!}` },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = (await res.json()) as { categories?: Array<{ cid: number; name: string }> };
    const match = (data.categories ?? []).find((c) => c.name === name);
    if (!match) throw new Error(`category "${name}" not found`);

    NODEBB_CATEGORY_ID = match.cid;
  } catch (err) {
    unavailableReason = `Ralphchives unavailable: failed to resolve category "${name}" — ${err instanceof Error ? err.message : err}`;
    console.warn(unavailableReason);
  }
}

// ---------------------------------------------------------------------------
// NodeBB API helpers
// ---------------------------------------------------------------------------

export async function nodebbGet<T = unknown>(path: string): Promise<T> {
  const url = new URL(path, NODEBB_API_URL);
  const res = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${NODEBB_API_TOKEN}`,
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`NodeBB API ${res.status}: ${text}`);
  }

  return (await res.json()) as T;
}

export function errorResult(err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  return {
    content: [{ type: "text" as const, text: JSON.stringify({ error: true, message }) }],
    isError: true,
  };
}
