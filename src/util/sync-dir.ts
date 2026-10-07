import { chmod, mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * Makes `target` an exact copy of `source` without replacing anything that stays.
 *
 * Bind mounts pin inodes: a container keeps seeing a replaced file or directory as it was when it
 * was mounted. So `target` itself is never removed, an unchanged file is not touched, a changed file
 * is overwritten in place (same inode), and only entries absent from `source` are deleted. File
 * modes follow `source`, so rendered scripts stay executable. Symlinks in `source` are followed.
 *
 * @param source Directory to copy from; must exist.
 * @param target Directory to update; created when missing.
 * @throws Error when `source` cannot be read or `target` cannot be written.
 */
export async function syncDirectory(source: string, target: string): Promise<void> {
  await mkdir(target, { recursive: true });

  const sourceNames = new Set(await readdir(source));
  for (const name of await readdir(target)) {
    if (!sourceNames.has(name)) await rm(join(target, name), { recursive: true, force: true });
  }

  for (const name of [...sourceNames].sort()) {
    const from = join(source, name);
    const to = join(target, name);
    const fromStat = await stat(from);
    const toStat = await stat(to).catch(() => undefined);

    if (fromStat.isDirectory()) {
      if (toStat && !toStat.isDirectory()) await rm(to, { force: true });
      await syncDirectory(from, to);
      continue;
    }

    if (toStat?.isDirectory()) await rm(to, { recursive: true, force: true });
    const content = await readFile(from);
    const existing = toStat?.isFile() ? await readFile(to) : undefined;
    if (!existing?.equals(content)) await writeFile(to, content);
    if (((await stat(to)).mode & 0o777) !== (fromStat.mode & 0o777)) await chmod(to, fromStat.mode & 0o777);
  }
}
