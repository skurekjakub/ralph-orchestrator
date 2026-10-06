/**
 * Prompt injection auditor — scans constructed prompts for common injection
 * patterns before they are passed to the agent CLI.
 *
 * This is a **tripwire defense**, not a guarantee. It catches accidental or
 * lazy injection attempts from work item data. Sophisticated adaptive attacks can
 * bypass heuristic scanning (see "The Attacker Moves Second", Oct 2025).
 *
 * The real security boundary is architectural: network isolation, Squid proxy
 * allowlist, and container hardening. This layer adds visibility and raises
 * the bar.
 *
 * @see https://simonwillison.net/series/prompt-injection/
 * @see https://arxiv.org/abs/2506.08837 — Design Patterns for Securing LLM Agents
 */

/** Severity of a detected pattern. */
export enum AuditSeverity {
  Warning = "warning",
  Critical = "critical",
}

/** The auditor's response mode — how to handle findings. */
export enum AuditMode {
  /** Block execution on critical findings. */
  Block = "block",
  /** Log findings but continue execution. */
  Warn = "warn",
  /** Skip prompt auditing entirely. */
  Off = "off",
}

/** A single finding from the prompt audit. */
export interface AuditFinding {
  severity: AuditSeverity;
  /** Human-readable name of the matched pattern category. */
  pattern: string;
  /** The matched text (truncated to 120 chars for log safety). */
  match: string;
  /** Which section of the prompt contained the finding (e.g. "description", "comments"). */
  section: string;
}

/** Result of a prompt audit. */
export interface AuditResult {
  /** True if no critical findings were detected (or mode is "warn"/"off"). */
  safe: boolean;
  /** Detected patterns, ordered by severity (critical first). */
  findings: AuditFinding[];
}

/**
 * A labelled section of untrusted content within the prompt.
 * Used for per-section audit with provenance tracking.
 */
export interface PromptSection {
  /** Where this content came from. */
  source: PromptSectionSource;
  /** Field name or identifier for logging. */
  fieldName: string;
  /** The raw content to audit. */
  content: string;
}

/** Provenance of a prompt section — indicates where the content originated. */
export enum PromptSectionSource {
  System = "system",
  WorkItemField = "work-item-field",
  Comment = "comment",
  Handoff = "handoff",
}

// ---------------------------------------------------------------------------
// Pattern definitions
// ---------------------------------------------------------------------------

interface PatternRule {
  name: string;
  severity: AuditSeverity;
  pattern: RegExp;
}

const INJECTION_PATTERNS: PatternRule[] = [
  // ── System instruction overrides ──
  {
    name: "instruction-override",
    severity: AuditSeverity.Critical,
    pattern:
      /\b(ignore|disregard|forget|override|bypass)\b.{0,30}\b(previous|prior|above|all|system|original)\b.{0,20}\b(instructions?|prompts?|rules?|guidelines?|constraints?)\b/i,
  },
  {
    name: "new-instructions",
    severity: AuditSeverity.Critical,
    pattern:
      /\b(new|updated|revised|real|actual|true)\s+(instructions?|directives?|system\s*prompt|guidelines?)\s*[:=]/i,
  },

  // ── Role hijacking ──
  {
    name: "role-hijack",
    severity: AuditSeverity.Warning,
    pattern:
      /\b(you\s+are\s+now|from\s+now\s+on\s+you\s+are|pretend\s+(you\s+are|to\s+be)|act\s+as\s+(if\s+you\s+are|a|an)|your\s+new\s+(role|persona|identity)\s+is)\b/i,
  },
  {
    name: "roleplay-exploit",
    severity: AuditSeverity.Warning,
    pattern:
      /\b(do\s+not\s+break\s+character|stay\s+in\s+character|you\s+must\s+always\s+respond\s+as|answer\s+only\s+as)\b/i,
  },

  // ── Model-specific prompt format tokens ──
  {
    name: "prompt-format-token",
    severity: AuditSeverity.Critical,
    pattern: /<\|im_start\|>|<\|im_end\|>|\[INST\]|\[\/INST\]|<<SYS>>|<\|system\|>|<\|user\|>|<\|assistant\|>/i,
  },

  // ── Context hijacking / memory manipulation ──
  {
    name: "context-hijack",
    severity: AuditSeverity.Critical,
    pattern:
      /\b(forget\s+everything|clear\s+(your\s+)?(memory|context|history)|start\s+fresh|reset\s+(your\s+)?(context|instructions|memory))\b/i,
  },

  // ── Data exfiltration indicators ──
  {
    name: "exfiltration-command",
    severity: AuditSeverity.Critical,
    pattern: /\b(curl|wget|fetch|nc|netcat|ncat)\b\s+.{0,10}https?:\/\//i,
  },
  {
    name: "suspicious-url-in-data",
    severity: AuditSeverity.Warning,
    pattern:
      /https?:\/\/(?!api\.atlassian\.com|dev\.azure\.com|github\.com|registry\.npmjs\.org|rubygems\.org)[^\s"')\]]{10,}/i,
  },

  // ── Encoding/obfuscation ──
  {
    name: "base64-block",
    severity: AuditSeverity.Warning,
    pattern: /(?<![A-Za-z0-9+/])[A-Za-z0-9+/]{60,}={0,2}(?![A-Za-z0-9+/])/,
  },
  {
    name: "unicode-control-chars",
    severity: AuditSeverity.Warning,
    pattern:
      /[\u200B\u200C\u200D\u200E\u200F\uFEFF\u2060\u2061\u2062\u2063\u2064\u2066\u2067\u2068\u2069\u202A\u202B\u202C\u202D\u202E]{3,}/,
  },

  // ── Output/behavior manipulation ──
  {
    name: "output-manipulation",
    severity: AuditSeverity.Warning,
    pattern:
      /\b(do\s+not\s+(mention|reveal|disclose|show)|never\s+(mention|reveal|tell|show)|hide\s+this\s+(from|in))\b/i,
  },

  // ── Delimiter escape attempts ──
  {
    name: "delimiter-flooding",
    severity: AuditSeverity.Warning,
    pattern: /(={10,}|`{6,}|-{10,}|\*{10,}|#{6,})/,
  },

  // ── Credential/env probing ──
  {
    name: "credential-probe",
    severity: AuditSeverity.Critical,
    pattern:
      /\b(print|echo|output|show|reveal|dump|cat|read)\b.{0,20}\b(env|\.env|password|secret|token|api[_\s]?key|credentials?|private[_\s]?key)\b/i,
  },

  // ── Git remote manipulation ──
  {
    name: "git-remote-manipulation",
    severity: AuditSeverity.Critical,
    pattern: /\bgit\s+(remote\s+(add|set-url)|push\s+.+@|clone\s+https?:\/\/(?!dev\.azure\.com|github\.com))\b/i,
  },
];

// ---------------------------------------------------------------------------
// Auditor
// ---------------------------------------------------------------------------

/**
 * Audit a prompt's untrusted sections for common injection patterns.
 *
 * Accepts labelled {@link PromptSection}s so findings include provenance
 * (which work item field or comment triggered the match).
 *
 * Sections with `source: "system"` are skipped — only untrusted content is scanned.
 */
export function auditPromptSections(sections: PromptSection[]): AuditResult {
  const findings: AuditFinding[] = [];

  for (const section of sections) {
    if (section.source === PromptSectionSource.System) continue;

    for (const rule of INJECTION_PATTERNS) {
      const match = rule.pattern.exec(section.content);
      if (match) {
        const truncated = match[0].length > 120 ? match[0].slice(0, 120) + "…" : match[0];

        findings.push({
          severity: rule.severity,
          pattern: rule.name,
          match: truncated,
          section: section.fieldName,
        });
      }
    }
  }

  findings.sort((a, b) => {
    if (a.severity === AuditSeverity.Critical && b.severity !== AuditSeverity.Critical) return -1;
    if (a.severity !== AuditSeverity.Critical && b.severity === AuditSeverity.Critical) return 1;
    return 0;
  });

  const hasCritical = findings.some((f) => f.severity === AuditSeverity.Critical);
  return { safe: !hasCritical, findings };
}

/**
 * Convenience: audit a pre-built prompt string as a single untrusted block.
 *
 * Use {@link auditPromptSections} when per-section provenance is available.
 */
export function auditPrompt(prompt: string): AuditResult {
  return auditPromptSections([
    { source: PromptSectionSource.WorkItemField, fieldName: "full-prompt", content: prompt },
  ]);
}

/**
 * Format audit findings into a human-readable summary for logging.
 */
export function formatAuditFindings(findings: AuditFinding[]): string {
  if (findings.length === 0) return "No suspicious patterns detected.";

  const lines = findings.map((f) => `  [${f.severity.toUpperCase()}] ${f.pattern} in "${f.section}": "${f.match}"`);
  return `Prompt audit found ${findings.length} finding(s):\n${lines.join("\n")}`;
}
