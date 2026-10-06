import { describe, it, expect } from "vitest";
import { credentialPolicyFor } from "../../src/cli/credential-catalog.js";
import { ClaudeAuthMode, CliType } from "../../src/config/types.js";

describe("credentialPolicyFor", () => {
  it("requires only the OAuth token for Claude Code in oauth-token mode", () => {
    // Act
    const policy = credentialPolicyFor(CliType.Claude, ClaudeAuthMode.OAuthToken);

    // Assert
    expect(policy.required.map((c) => c.envVar)).toEqual(["CLAUDE_CODE_OAUTH_TOKEN"]);
  });

  it("requires only the API key for Claude Code in api-key mode", () => {
    // Act
    const policy = credentialPolicyFor(CliType.Claude, ClaudeAuthMode.ApiKey);

    // Assert
    expect(policy.required.map((c) => c.envVar)).toEqual(["ANTHROPIC_API_KEY"]);
  });

  it.each([ClaudeAuthMode.OAuthToken, ClaudeAuthMode.ApiKey])(
    "requires GH_TOKEN for Copilot whatever the Claude auth mode (%s)",
    (claudeAuth) => {
      // Act
      const policy = credentialPolicyFor(CliType.Copilot, claudeAuth);

      // Assert
      expect(policy.required.map((c) => c.envVar)).toEqual(["GH_TOKEN"]);
    },
  );

  it("explains what each credential is for", () => {
    // Act
    const credentials = [CliType.Claude, CliType.Copilot].flatMap(
      (cli) => credentialPolicyFor(cli, ClaudeAuthMode.OAuthToken).required,
    );

    // Assert
    expect(credentials.every((c) => c.purpose.length > 0)).toBe(true);
  });
});
