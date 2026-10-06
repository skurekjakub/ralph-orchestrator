import { ClaudeAuthMode, CliType } from "../config/types.js";

/** One environment variable a CLI reads to authenticate. */
export interface CliCredential {
  /** Variable name, read from `.env` on the host. */
  readonly envVar: string;
  /** What the credential is and where to get it, shown to the operator when it is missing. */
  readonly purpose: string;
}

/** The credentials one CLI needs to authenticate. */
export interface ICliCredentialPolicy {
  /** Variables that must all be set before any stage runs this CLI. */
  readonly required: readonly CliCredential[];
}

/** Copilot CLI authenticates with a GitHub PAT. */
export const COPILOT_CREDENTIALS: ICliCredentialPolicy = {
  required: [{ envVar: "GH_TOKEN", purpose: "GitHub PAT with the Copilot Requests permission, used by Copilot CLI" }],
};

/** Claude Code authenticates with exactly one credential, chosen by `claudeAuth` in config.json. */
export function claudeCodeCredentials(auth: ClaudeAuthMode): ICliCredentialPolicy {
  switch (auth) {
    case ClaudeAuthMode.OAuthToken:
      return {
        required: [
          {
            envVar: "CLAUDE_CODE_OAUTH_TOKEN",
            purpose: 'Claude Code OAuth token from `claude setup-token` (claudeAuth: "oauth-token")',
          },
        ],
      };
    case ClaudeAuthMode.ApiKey:
      return {
        required: [
          { envVar: "ANTHROPIC_API_KEY", purpose: 'Anthropic API key for Claude Code (claudeAuth: "api-key")' },
        ],
      };
  }
}

/** The credential policy of `cli` under the configured Claude Code auth mode. */
export function credentialPolicyFor(cli: CliType, claudeAuth: ClaudeAuthMode): ICliCredentialPolicy {
  switch (cli) {
    case CliType.Claude:
      return claudeCodeCredentials(claudeAuth);
    case CliType.Copilot:
      return COPILOT_CREDENTIALS;
  }
}
