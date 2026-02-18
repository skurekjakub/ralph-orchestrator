/**
 * PromptBuilder — encapsulates prompt construction, content normalization,
 * and prompt injection auditing.
 *
 * Provides a single entry point for the rest of the framework to build
 * and validate prompts from JIRA data. The container manager and task runner
 * should treat prompt preparation as a black box handled by this class.
 */

import type { JiraIssue } from "../jira/types.js";
import type { IssueContext } from "./prompt.js";
import { buildPromptWithSections } from "./prompt.js";
import {
  AuditMode,
  AuditSeverity,
  auditPromptSections,
  formatAuditFindings,
} from "./prompt-auditor.js";
import type { AuditResult } from "./prompt-auditor.js";
import type { Logger } from "../logger.js";

/** Result of building and auditing a prompt. */
export interface BuiltPrompt {
  /** The assembled prompt string ready for CLI execution. */
  text: string;
  /** Audit result (empty findings when auditing is off). */
  audit: AuditResult;
}

/**
 * Builds and audits prompts from JIRA issue data.
 *
 * Responsibilities:
 * - Normalizes untrusted content (invisible chars, HTML comments, whitespace)
 * - Wraps untrusted data in delimiters
 * - Scans for injection patterns based on configured audit mode
 * - Logs findings and optionally blocks execution
 *
 * @example
 * ```ts
 * const builder = new PromptBuilder(AuditMode.Warn, logger);
 * const { text, audit } = builder.build(issue, context);
 * if (!audit.safe) throw new Error("Blocked");
 * await executor.run(text);
 * ```
 */
export class PromptBuilder {
  constructor(
    private readonly mode: AuditMode,
    private readonly logger: Logger,
  ) {}

  /**
   * Build a prompt from a JIRA issue and optional context.
   *
   * Normalizes content, wraps untrusted data in delimiters, and runs the
   * prompt injection auditor. In {@link AuditMode.Warn} mode, findings are
   * logged but execution continues. In {@link AuditMode.Block} mode, the
   * result's `audit.safe` will be `false` for critical findings — the caller
   * is responsible for throwing.
   *
   * @param issue JIRA issue to process.
   * @param context Pre-fetched issue context (comments, revision handoff).
   * @returns The assembled prompt text and audit result.
   */
  build(issue: JiraIssue, context?: IssueContext): BuiltPrompt {
    const { prompt, sections } = buildPromptWithSections(issue, context);

    if (this.mode === AuditMode.Off) {
      return { text: prompt, audit: { safe: true, findings: [] } };
    }

    const audit = auditPromptSections(sections);

    if (audit.findings.length > 0) {
      this.logger.warn(formatAuditFindings(audit.findings));
    }

    if (!audit.safe && this.mode === AuditMode.Block) {
      const criticalCount = audit.findings.filter(
        (f) => f.severity === AuditSeverity.Critical,
      ).length;
      throw new Error(
        `Prompt audit blocked execution for ${issue.key}: ${criticalCount} critical finding(s) detected`,
      );
    }

    return { text: prompt, audit };
  }
}
