import { beforeEach, describe, expect, it, vi } from "vitest";
import { execa } from "execa";
import { validateHostTools } from "../../src/validate/host-tools";
import { fakeExecResult } from "../helpers/mocks";

vi.mock("execa", async (importOriginal) => ({
  ...(await importOriginal<typeof import("execa")>()),
  execa: vi.fn(),
}));

describe("validateHostTools", () => {
  beforeEach(() => {
    vi.mocked(execa).mockReset();
  });

  it("passes when perl runs", async () => {
    // Arrange
    vi.mocked(execa).mockResolvedValue(fakeExecResult());
    const errors: string[] = [];

    // Act
    await validateHostTools({ errors, warnings: [] });

    // Assert
    expect(errors).toEqual([]);
    expect(execa).toHaveBeenCalledWith("perl", ["-e", "1"], expect.objectContaining({ timeout: 10_000 }));
  });

  it("fails when perl cannot run, naming the transcript redaction that needs it", async () => {
    // Arrange
    vi.mocked(execa).mockRejectedValue(new Error("spawn perl ENOENT"));
    const errors: string[] = [];

    // Act
    await validateHostTools({ errors, warnings: [] });

    // Assert
    expect(errors).toEqual([expect.stringContaining("perl was not found on the host")]);
    expect(errors[0]).toContain("shared/hooks/lib/redact.pl");
  });
});
