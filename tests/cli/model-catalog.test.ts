import { describe, it, expect } from "vitest";
import {
  CLAUDE_MODEL_POLICY,
  COPILOT_MODEL_POLICY,
  COPILOT_MODEL_FOR_ALIAS,
  ClaudeModelAlias,
  modelPolicyFor,
} from "../../src/cli/model-catalog";
import { CliType } from "../../src/config/types";

describe("CLAUDE_MODEL_POLICY", () => {
  describe("validate", () => {
    it.each(["opus", "sonnet", "haiku", "fable"])("accepts the alias %s", (alias) => {
      // Act & Assert
      expect(CLAUDE_MODEL_POLICY.validate(alias)).toBeNull();
    });

    it("accepts an alias with the 1M-context suffix", () => {
      // Act & Assert
      expect(CLAUDE_MODEL_POLICY.validate("opus[1m]")).toBeNull();
    });

    it.each(["claude-opus-5-5", "claude-haiku-4-5-20251001", "claude-fable-5-1", "claude-opus-5-5[1m]"])(
      "accepts the full id %s",
      (id) => {
        // Act & Assert
        expect(CLAUDE_MODEL_POLICY.validate(id)).toBeNull();
      },
    );

    it("rejects a dotted Copilot id and suggests the alias and the hyphenated id", () => {
      // Act
      const reason = CLAUDE_MODEL_POLICY.validate("claude-opus-4.6");

      // Assert
      expect(reason).toContain('"claude-opus-4.6"');
      expect(reason).toContain('"opus"');
      expect(reason).toContain('"claude-opus-4-6"');
    });

    it("rejects a non-Claude model", () => {
      // Act
      const reason = CLAUDE_MODEL_POLICY.validate("gpt-5.4");

      // Assert
      expect(reason).toContain('"gpt-5.4" is not a Claude Code model');
    });

    it("rejects an alias in the wrong case", () => {
      // Act & Assert
      expect(CLAUDE_MODEL_POLICY.validate("Opus")).not.toBeNull();
    });
  });

  it("has no default model so the agent definition decides", () => {
    // Act & Assert
    expect(CLAUDE_MODEL_POLICY.defaultModel).toBeUndefined();
  });

  it("maps canonical models to themselves", () => {
    // Act & Assert
    expect(CLAUDE_MODEL_POLICY.fromCanonical("sonnet", { copilot: "gpt-5.4" })).toBe("sonnet");
  });
});

describe("COPILOT_MODEL_POLICY", () => {
  describe("validate", () => {
    it.each(["claude-opus-4.6", "claude-sonnet-4", "gpt-5.4", "gpt-5.3-codex", "gemini-3-pro-preview"])(
      "accepts the Copilot id %s",
      (id) => {
        // Act & Assert
        expect(COPILOT_MODEL_POLICY.validate(id)).toBeNull();
      },
    );

    it("rejects a Claude Code alias and suggests the Copilot equivalent", () => {
      // Act
      const reason = COPILOT_MODEL_POLICY.validate("opus");

      // Assert
      expect(reason).toContain('"opus" is a Claude Code alias');
      expect(reason).toContain(`"${COPILOT_MODEL_FOR_ALIAS[ClaudeModelAlias.Opus]}"`);
    });

    it("rejects a 1M-context alias and suggests the Copilot equivalent", () => {
      // Act
      const reason = COPILOT_MODEL_POLICY.validate("sonnet[1m]");

      // Assert
      expect(reason).toContain(`"${COPILOT_MODEL_FOR_ALIAS[ClaudeModelAlias.Sonnet]}"`);
    });

    it.each([
      ["claude-opus-4-6", "claude-opus-4.6"],
      ["claude-haiku-4-5-20251001", "claude-haiku-4.5"],
      ["claude-sonnet-4-20250514", "claude-sonnet-4"],
      ["claude-opus-4-6[1m]", "claude-opus-4.6"],
    ])("rejects the Claude Code id %s and suggests %s", (id, suggestion) => {
      // Act
      const reason = COPILOT_MODEL_POLICY.validate(id);

      // Assert
      expect(reason).toContain("is a Claude Code model id");
      expect(reason).toContain(`"${suggestion}"`);
    });

    it.each(["Claude Opus", "", "claude_opus", "gpt-5."])("rejects the malformed id %j", (id) => {
      // Act
      const reason = COPILOT_MODEL_POLICY.validate(id);

      // Assert
      expect(reason).toContain("is not a valid Copilot model id");
    });
  });

  it("has a default model that is itself a valid Copilot model", () => {
    // Arrange
    const defaultModel = COPILOT_MODEL_POLICY.defaultModel;

    // Act & Assert
    expect(defaultModel && COPILOT_MODEL_POLICY.validate(defaultModel)).toBeNull();
  });

  describe("fromCanonical", () => {
    it("maps an alias to its Copilot model", () => {
      // Act & Assert
      expect(COPILOT_MODEL_POLICY.fromCanonical("haiku")).toBe(COPILOT_MODEL_FOR_ALIAS[ClaudeModelAlias.Haiku]);
    });

    it("maps a 1M-context alias to the plain alias's Copilot model", () => {
      // Act & Assert
      expect(COPILOT_MODEL_POLICY.fromCanonical("opus[1m]")).toBe(COPILOT_MODEL_FOR_ALIAS[ClaudeModelAlias.Opus]);
    });

    it("prefers the agent's Copilot override", () => {
      // Act & Assert
      expect(COPILOT_MODEL_POLICY.fromCanonical("opus", { copilot: "gpt-5.4" })).toBe("gpt-5.4");
    });

    it("maps a full Claude Code id to the dotted Copilot id", () => {
      // Act & Assert
      expect(COPILOT_MODEL_POLICY.fromCanonical("claude-sonnet-4-5-20250929")).toBe("claude-sonnet-4.5");
    });

    it("throws for a model with no Copilot equivalent", () => {
      // Act & Assert
      expect(() => COPILOT_MODEL_POLICY.fromCanonical("inherit")).toThrow(
        'model "inherit" has no Copilot CLI equivalent',
      );
    });
  });
});

describe("modelPolicyFor", () => {
  it("returns the policy of the given CLI", () => {
    // Act
    const claude = modelPolicyFor(CliType.Claude);
    const copilot = modelPolicyFor(CliType.Copilot);

    // Assert
    expect(claude.validate("opus")).toBeNull();
    expect(copilot.validate("opus")).not.toBeNull();
  });
});
