import type { ValidationCollector } from "./types";

export async function validateDocker({ errors }: ValidationCollector): Promise<void> {
  try {
    const { execa } = await import("execa");
    await execa("docker", ["info"], { timeout: 10_000 });
  } catch {
    errors.push(
      "Docker is not running or not accessible\n" +
        "  Start Docker Desktop or the Docker daemon before running the orchestrator",
    );
  }
}
