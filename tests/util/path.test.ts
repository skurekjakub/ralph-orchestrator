import { describe, it, expect } from "vitest";
import { resolvePath } from "../../src/util/path.js";
import { resolve } from "node:path";

describe("resolvePath", () => {
  it("resolves a relative path to absolute", () => {
    const result = resolvePath("foo/bar");
    expect(result).toBe(resolve("foo/bar"));
  });

  it("strips surrounding double quotes", () => {
    const result = resolvePath('"foo/bar"');
    expect(result).toBe(resolve("foo/bar"));
  });

  it("strips surrounding single quotes", () => {
    const result = resolvePath("'foo/bar'");
    expect(result).toBe(resolve("foo/bar"));
  });

  it("expands ~ to HOME directory", () => {
    const home = process.env.HOME ?? "/root";
    const result = resolvePath("~/projects/repo");
    expect(result).toBe(resolve(home, "projects/repo"));
  });

  it("passes through absolute paths unchanged", () => {
    const result = resolvePath("/usr/local/bin");
    expect(result).toBe("/usr/local/bin");
  });

  it("handles quoted tilde paths", () => {
    const home = process.env.HOME ?? "/root";
    const result = resolvePath('"~/my repo"');
    expect(result).toBe(resolve(home, "my repo"));
  });
});
