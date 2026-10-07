import type { CliRunOutcome, DecodedLine, ICliOutputDecoder } from "./output-decoder";

/** Decoder for a CLI that prints its answer as plain text: every stdout line is both a log line and agent text. */
export class PlainTextDecoder implements ICliOutputDecoder {
  readonly answerEndsAtResultBlock = true;
  private readonly lines: string[] = [];

  decodeLine(rawLine: string): DecodedLine {
    this.lines.push(rawLine);
    return { logLines: [rawLine], agentText: rawLine };
  }

  finish(): CliRunOutcome {
    return { agentText: this.lines.join("\n") };
  }
}
