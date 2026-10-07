import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { resolveComposeFiles } from "../../src/container/setup/compose-files";
import { makeProfile } from "../helpers/factories";

const TMP = join(import.meta.dirname, ".tmp-compose-files");

describe("resolveComposeFiles", () => {
  beforeEach(() => {
    mkdirSync(join(TMP, "profiles/test-profile/.build"), { recursive: true });
    mkdirSync(join(TMP, "shared/security"), { recursive: true });
    writeFileSync(join(TMP, "profiles/test-profile/docker-compose.yml"), "");
    writeFileSync(join(TMP, "shared/security/docker-compose.security.yml"), "");
  });

  afterEach(() => {
    rmSync(TMP, { recursive: true, force: true });
  });

  it("returns base + security when no overlay exists", () => {
    const profile = makeProfile({
      id: "test-profile",
      composeFile: "profiles/test-profile/docker-compose.yml",
    });

    const files = resolveComposeFiles(profile, TMP);

    expect(files).toHaveLength(2);
    expect(files[0]).toContain("docker-compose.yml");
    expect(files[1]).toContain("docker-compose.security.yml");
  });

  it("includes overlay when it exists", () => {
    writeFileSync(join(TMP, "profiles/test-profile/.build/docker-compose.overlay.yml"), "");

    const profile = makeProfile({
      id: "test-profile",
      composeFile: "profiles/test-profile/docker-compose.yml",
    });

    const files = resolveComposeFiles(profile, TMP);

    expect(files).toHaveLength(3);
    expect(files[2]).toContain("docker-compose.overlay.yml");
  });
});
