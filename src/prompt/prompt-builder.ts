/**
 * PromptBuilder — encapsulates prompt construction, content normalization,
 * and prompt injection auditing.
 *
 * Provides a single entry point for the rest of the framework to build
 * and validate prompts from work item data. The container manager and task runner
 * should treat prompt preparation as a black box handled by this class.
 */

import type { IPromptAuditConfig } from "../config/types.js";
import type { WorkItem } from "../datasource/types.js";
import { buildPromptWithSections, type IssueContext } from "./prompt.js";
import {
  AuditMode,
  AuditSeverity,
  auditPromptSections,
  formatAuditFindings,
  type AuditResult,
} from "./prompt-auditor.js";
import type { Logger } from "../logger.js";

/** Result of building and auditing a prompt. */
export interface BuiltPrompt {
  /** The assembled prompt string ready for CLI execution. */
  text: string;
  /** Audit result (empty findings when auditing is off). */
  audit: AuditResult;
}

/**
 * Builds and audits prompts from work item data.
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
  private readonly mode: AuditMode;
  private readonly logger: Logger;

  constructor({ promptAuditConfig, logger }: {
    promptAuditConfig: IPromptAuditConfig;
    logger: Logger;
  }) {
    this.mode = promptAuditConfig.mode;
    this.logger = logger;
  }

  /**
   * Build a prompt from a work item and optional context.
   *
   * Normalizes content, wraps untrusted data in delimiters, and runs the
   * prompt injection auditor. In {@link AuditMode.Warn} mode, findings are
   * logged but execution continues. In {@link AuditMode.Block} mode, the
   * result's `audit.safe` will be `false` for critical findings — the caller
   * is responsible for throwing.
   *
   * @param workItem Work item to process.
   * @param context Pre-fetched issue context (comments, revision handoff).
   * @returns The assembled prompt text and audit result.
   */
  build(workItem: WorkItem, context?: IssueContext): BuiltPrompt {
    const { prompt, sections } = buildPromptWithSections(workItem, context);

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
        `Prompt audit blocked execution for ${workItem.id}: ${criticalCount} critical finding(s) detected`,
      );
    }

    return { text: prompt, audit };
  }
}
