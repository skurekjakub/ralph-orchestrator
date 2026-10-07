import { describe, it, expect } from "vitest";
import { truncate } from "../../src/util/text";

describe("truncate", () => {
  it("keeps text no longer than the limit unchanged", () => {
    // Act & Assert
    expect(truncate("abc", 3)).toBe("abc");
    expect(truncate("", 0)).toBe("");
  });

  it("cuts longer text to the limit and marks the cut", () => {
    // Act & Assert
    expect(truncate("abcdef", 3)).toBe("abc…");
  });
});
