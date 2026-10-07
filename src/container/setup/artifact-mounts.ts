import { join } from "node:path";

/**
 * One read-only bind mount per agent file, in compose short syntax.
 *
 * @param fileNames Agent file names, as rendered into `renderedDir`.
 * @param renderedDir Host directory holding the rendered agent files.
 * @param containerDir Container directory the CLI discovers agents in.
 */
export function agentFileMounts(fileNames: readonly string[], renderedDir: string, containerDir: string): string[] {
  return fileNames.map((file) => `${join(renderedDir, file)}:${containerDir}/${file}:ro`);
}

/**
 * One read-only bind mount per skill directory, in compose short syntax.
 *
 * @param skillNames Skill names, each rendered into `<renderedDir>/<name>/`.
 * @param renderedDir Host directory holding the rendered skills.
 * @param containerDir Container directory the CLI discovers skills in.
 */
export function skillDirMounts(skillNames: readonly string[], renderedDir: string, containerDir: string): string[] {
  return skillNames.map((name) => `${join(renderedDir, name)}:${containerDir}/${name}:ro`);
}
