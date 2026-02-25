/**
 * YAML read/write helpers with automatic directory creation.
 */

import fs from "node:fs/promises";
import path from "node:path";
import yaml from "js-yaml";

export async function readYaml<T>(filePath: string): Promise<T | null> {
  try {
    const content = await fs.readFile(filePath, "utf-8");
    return yaml.load(content) as T;
  } catch {
    return null;
  }
}

export async function writeYaml(filePath: string, data: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const content = yaml.dump(data, {
    indent: 2,
    lineWidth: 120,
    noRefs: true,
    sortKeys: false,
  });
  await fs.writeFile(filePath, content, "utf-8");
}

export async function appendYamlEntry(filePath: string, entry: unknown): Promise<void> {
  const existing = await readYaml<unknown[]>(filePath);
  const arr = Array.isArray(existing) ? existing : [];
  arr.push(entry);
  await writeYaml(filePath, arr);
}

export async function readMarkdown(filePath: string): Promise<string | null> {
  try {
    return await fs.readFile(filePath, "utf-8");
  } catch {
    return null;
  }
}

export async function writeMarkdown(filePath: string, content: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, "utf-8");
}
