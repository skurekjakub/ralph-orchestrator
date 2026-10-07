import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CliType, StageMode } from "../../src/config/types";
import { TaskStatus } from "../../src/container/types";
import { buildHookManifest, readHookManifest, writeHookManifest } from "../../src/services/hook-manifest";
import { makeProfile, makeStage, makeTaskContext, makeWorkItem } from "../helpers/factories";

describe("hook manifest", () => {
  let outputDir: string;

  beforeEach(() => {
    outputDir = mkdtempSync(join(tmpdir(), "hook-manifest-"));
  });

  afterEach(() => {
    rmSync(outputDir, { recursive: true, force: true });
  });

  function taskContext() {
    const workItem = { ...makeWorkItem("DOC-7"), title: "Document the cache API", description: "Cover eviction." };
    const profile = makeProfile({
      id: "docs",
      stages: [makeStage({ cli: CliType.Claude })],
      postTaskHooks: [
        {
          name: "run-analysis",
          stages: [makeStage({ agent: "ralph.scientist", role: "scientist", mode: StageMode.Local, model: "opus" })],
        },
      ],
    });
    return makeTaskContext({ workItem, profile, outputDir, triggerParams: { skip_hooks: "true" } });
  }

  it("reads back the work item, variant, analysed run and hooks the task wrote", async () => {
    // Arrange
    const ctx = taskContext();
    const run = { collectedLogs: { audit: join(outputDir, "audit.jsonl") }, clis: [CliType.Claude, CliType.Copilot] };

    // Act
    await writeHookManifest(outputDir, buildHookManifest(ctx, run, TaskStatus.Partial));
    const manifest = await readHookManifest(outputDir);

    // Assert
    expect(manifest).toMatchObject({
      taskId: ctx.taskId,
      workItem: {
        id: "DOC-7",
        source: ctx.workItem.source,
        title: "Document the cache API",
        description: "Cover eviction.",
      },
      variantKey: ctx.profile.variantKey,
      status: TaskStatus.Partial,
      collectedLogs: run.collectedLogs,
      clis: [CliType.Claude, CliType.Copilot],
      hooks: ctx.profile.postTaskHooks,
    });
  });

  it("reports a missing manifest as missing", async () => {
    // Act & Assert
    await expect(readHookManifest(outputDir)).rejects.toThrow(
      `No hook manifest at ${join(outputDir, "hook-manifest.json")}`,
    );
  });

  it("reports a manifest that is not JSON as such", async () => {
    // Arrange
    writeFileSync(join(outputDir, "hook-manifest.json"), "{ not json");

    // Act & Assert
    await expect(readHookManifest(outputDir)).rejects.toThrow(
      `Hook manifest ${join(outputDir, "hook-manifest.json")} is not valid JSON`,
    );
  });

  it("rejects a manifest without the analysed run's CLIs, naming the field", async () => {
    // Arrange
    const { clis: _clis, ...withoutClis } = buildHookManifest(
      taskContext(),
      { collectedLogs: {}, clis: [CliType.Claude] },
      TaskStatus.Completed,
    );
    writeFileSync(join(outputDir, "hook-manifest.json"), JSON.stringify(withoutClis));

    // Act & Assert
    await expect(readHookManifest(outputDir)).rejects.toThrow(/is malformed:[\s\S]*clis/);
  });

  it("rejects a hook name that would leave the task's hooks directory", async () => {
    // Arrange
    const manifest = buildHookManifest(
      taskContext(),
      { collectedLogs: {}, clis: [CliType.Claude] },
      TaskStatus.Completed,
    );
    const escaping = { ...manifest, hooks: [{ ...manifest.hooks[0], name: "../../etc" }] };
    writeFileSync(join(outputDir, "hook-manifest.json"), JSON.stringify(escaping));

    // Act & Assert
    await expect(readHookManifest(outputDir)).rejects.toThrow(/is malformed:[\s\S]*hooks\[0\]\.name/);
  });
});
