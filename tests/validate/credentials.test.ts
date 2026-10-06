import { describe, it, expect } from "vitest";
import { validateCliCredentials } from "../../src/validate/credentials";
import type { ValidationCollector } from "../../src/validate/types";
import { ClaudeAuthMode, CliType, StageMode } from "../../src/config/types";
import { makeProfile, makeStage } from "../helpers/factories";

function collector(): ValidationCollector {
  return { errors: [], warnings: [] };
}

const COPILOT_PROFILE = makeProfile({ id: "copilot-profile" });
const CLAUDE_PROFILE = makeProfile({ id: "claude-profile", stages: [makeStage({ cli: CliType.Claude })] });

describe("validateCliCredentials", () => {
  it("passes when every CLI the stages run has its credential", () => {
    // Arrange
    const c = collector();

    // Act
    validateCliCredentials(
      [COPILOT_PROFILE, CLAUDE_PROFILE],
      ClaudeAuthMode.OAuthToken,
      {
        GH_TOKEN: "ghp",
        CLAUDE_CODE_OAUTH_TOKEN: "oauth",
      },
      c,
    );

    // Assert
    expect(c.errors).toEqual([]);
  });

  it("requires GH_TOKEN when a stage runs Copilot, naming the profile and what the token is for", () => {
    // Arrange
    const c = collector();

    // Act
    validateCliCredentials([COPILOT_PROFILE], ClaudeAuthMode.OAuthToken, {}, c);

    // Assert
    expect(c.errors).toHaveLength(1);
    expect(c.errors[0]).toMatch(
      /^Missing env var GH_TOKEN for cli "copilot" \(used by profiles\/copilot-profile\)\n {2}\S/,
    );
  });

  it("does not require GH_TOKEN when no stage runs Copilot", () => {
    // Arrange
    const c = collector();

    // Act
    validateCliCredentials([CLAUDE_PROFILE], ClaudeAuthMode.OAuthToken, { CLAUDE_CODE_OAUTH_TOKEN: "oauth" }, c);

    // Assert
    expect(c.errors).toEqual([]);
  });

  it("requires the OAuth token, not the API key, for Claude stages in oauth-token mode", () => {
    // Arrange
    const c = collector();

    // Act
    validateCliCredentials([CLAUDE_PROFILE], ClaudeAuthMode.OAuthToken, { ANTHROPIC_API_KEY: "key" }, c);

    // Assert
    expect(c.errors).toHaveLength(1);
    expect(c.errors[0]).toContain('Missing env var CLAUDE_CODE_OAUTH_TOKEN for cli "claude"');
  });

  it("requires the API key, not the OAuth token, for Claude stages in api-key mode", () => {
    // Arrange
    const c = collector();

    // Act
    validateCliCredentials([CLAUDE_PROFILE], ClaudeAuthMode.ApiKey, { CLAUDE_CODE_OAUTH_TOKEN: "oauth" }, c);

    // Assert
    expect(c.errors).toHaveLength(1);
    expect(c.errors[0]).toContain('Missing env var ANTHROPIC_API_KEY for cli "claude"');
  });

  it("counts the CLIs of post-task hook stages", () => {
    // Arrange
    const profile = makeProfile({
      id: "hooked",
      postTaskHooks: [{ name: "analysis", stages: [makeStage({ mode: StageMode.Local, cli: CliType.Claude })] }],
    });
    const c = collector();

    // Act
    validateCliCredentials([profile], ClaudeAuthMode.OAuthToken, { GH_TOKEN: "ghp" }, c);

    // Assert
    expect(c.errors).toHaveLength(1);
    expect(c.errors[0]).toContain('CLAUDE_CODE_OAUTH_TOKEN for cli "claude" (used by profiles/hooked)');
  });

  it("treats an empty variable as missing", () => {
    // Arrange
    const c = collector();

    // Act
    validateCliCredentials([COPILOT_PROFILE], ClaudeAuthMode.OAuthToken, { GH_TOKEN: "" }, c);

    // Assert
    expect(c.errors).toHaveLength(1);
  });

  it("reports a missing credential once, naming every profile that needs it", () => {
    // Arrange
    const variants = [
      makeProfile({ id: "a" }),
      makeProfile({ id: "a", match: { commentTrigger: "@other" } }),
      makeProfile({ id: "b" }),
    ];
    const c = collector();

    // Act
    validateCliCredentials(variants, ClaudeAuthMode.OAuthToken, {}, c);

    // Assert
    expect(c.errors).toHaveLength(1);
    expect(c.errors[0]).toContain("(used by profiles/a, profiles/b)");
  });

  it("requires nothing without profiles", () => {
    // Arrange
    const c = collector();

    // Act
    validateCliCredentials([], ClaudeAuthMode.OAuthToken, {}, c);

    // Assert
    expect(c.errors).toEqual([]);
  });
});
