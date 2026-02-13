export interface ContainerExecResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

export interface RalphResult {
  issueKey: string;
  status: "completed" | "partial" | "blocked" | "error";
  durationMs: number;
  exitCode: number;
  stdout: string;
  stderr: string;
  handoffPath?: string;
  auditLogPath?: string;
  prUrl?: string;
}
