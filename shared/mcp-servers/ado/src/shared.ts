import type { ToolCallback } from "@modelcontextprotocol/sdk/server/mcp.js";
import axios from "axios";
import { HttpsProxyAgent } from "https-proxy-agent";
import type { ZodRawShape } from "zod";

/** Tool definition returned by each tool module. */
export interface ToolDefinition {
  name: string;
  config: { description: string; inputSchema: ZodRawShape };
  handler: ToolCallback<ZodRawShape>;
}

export const ORG = "KenticoCustomerSuccess";
export const API_VERSION = "7.1";
export const apiBase = `https://dev.azure.com/${ORG}`;

const ADO_PAT = process.env.ADO_PAT;

if (!ADO_PAT) {
  console.error("ADO_PAT must be set");
  process.exit(1);
}

const authHeader = `Basic ${Buffer.from(`:${ADO_PAT}`).toString("base64")}`;

const proxyUrl = process.env.HTTPS_PROXY || process.env.https_proxy
  || process.env.HTTP_PROXY || process.env.http_proxy;
const httpsAgent = proxyUrl ? new HttpsProxyAgent(proxyUrl) : undefined;

/** Shared axios config for all requests. */
export function reqConfig(headers?: Record<string, string>) {
  return {
    headers: {
      "Content-Type": "application/json",
      Authorization: authHeader,
      ...headers,
    },
    httpsAgent,
    proxy: false as const,
  };
}

/** Build a repo-scoped API URL. */
export function repoUrl(project: string, repositoryId: string, path: string) {
  return `${apiBase}/${encodeURIComponent(project)}/_apis/git/repositories/${encodeURIComponent(repositoryId)}/${path}?api-version=${API_VERSION}`;
}

export function errorResult(err: unknown) {
  const status = axios.isAxiosError(err) ? err.response?.status ?? 0 : 0;
  const message = axios.isAxiosError(err) ? err.response?.data ?? err.message : String(err);
  return {
    content: [{ type: "text" as const, text: JSON.stringify({ error: true, status, message }) }],
    isError: true,
  };
}
