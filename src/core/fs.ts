import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export async function ensureDir(path: string): Promise<void> {
  await mkdir(path, { recursive: true });
}

export async function walkFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = join(dir, entry.name);

      if (entry.isDirectory()) {
        return walkFiles(fullPath);
      }

      return [fullPath];
    }),
  );

  return nested.flat();
}

export async function readTextFile(path: string): Promise<string> {
  return readFile(path, "utf8");
}

export async function writeJsonFile(path: string, value: unknown): Promise<void> {
  await ensureDir(dirname(path));
  const temporaryPath = `${path}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(temporaryPath, JSON.stringify(value, null, 2), "utf8");
  await rename(temporaryPath, path);
}

export async function readJsonFile<T>(path: string): Promise<T> {
  const raw = await readFile(path, "utf8");
  return JSON.parse(raw) as T;
}
