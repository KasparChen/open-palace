/**
 * Component Store — the "arsenal" of knowledge modules.
 *
 * Each component is self-contained with its own summary (L1),
 * changelog, and raw data directory (L2).
 *
 * Components can be "loaded" (detail in context) or just
 * "known" (entry in L0 index).
 */

import fs from "node:fs/promises";
import { paths } from "../utils/paths.js";
import { readMarkdown, writeMarkdown, readYaml, writeYaml } from "../utils/yaml.js";
import { triggerHook } from "./posthook.js";
import { updateIndexEntry, formatIndexDate } from "./index.js";
import type { ComponentType, ChangelogEntry } from "../types.js";

const loadedComponents: Set<string> = new Set();

const TYPE_TAG_MAP: Record<ComponentType, string> = {
  projects: "P",
  knowledge: "K",
  skills: "C",
  relationships: "R",
};

export async function listComponents(type?: ComponentType): Promise<string[]> {
  const result: string[] = [];
  const types: ComponentType[] = type
    ? [type]
    : ["projects", "knowledge", "skills", "relationships"];

  for (const t of types) {
    const dir = `${paths.componentsDir()}/${t}`;
    try {
      const entries = await fs.readdir(dir);
      for (const entry of entries) {
        const stat = await fs.stat(`${dir}/${entry}`);
        if (stat.isDirectory()) {
          result.push(`${t}/${entry}`);
        }
      }
    } catch {
      // directory may not exist yet
    }
  }

  return result;
}

export async function createComponent(
  type: ComponentType,
  key: string,
  summary: string
): Promise<void> {
  const dir = paths.componentDir(type, key);
  await fs.mkdir(dir, { recursive: true });
  await fs.mkdir(paths.componentRawDir(type, key), { recursive: true });

  await writeMarkdown(
    paths.componentSummary(type, key),
    `# ${key}\n\n${summary}\n`
  );

  await writeYaml(paths.componentChangelog(type, key), []);

  // Update L0 index
  const tag = TYPE_TAG_MAP[type];
  const dateStr = formatIndexDate();
  await updateIndexEntry(tag, key, `★ active | ⟳${dateStr}`);

  await triggerHook("component.create", {
    scope: `${type}/${key}`,
    summary: `created component: ${type}/${key}`,
  });
}

export async function loadComponent(
  key: string
): Promise<{ summary: string; recent_changelog: ChangelogEntry[] } | null> {
  const [type, ...rest] = key.split("/");
  const name = rest.join("/");
  const summaryPath = paths.componentSummary(type, name);
  const changelogPath = paths.componentChangelog(type, name);

  const summary = await readMarkdown(summaryPath);
  if (!summary) return null;

  const changelog = await readYaml<ChangelogEntry[]>(changelogPath);
  const recent = (changelog ?? [])
    .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
    .slice(0, 10);

  loadedComponents.add(key);

  await triggerHook("component.load", {
    scope: key,
    summary: `loaded component: ${key}`,
  });

  return { summary, recent_changelog: recent };
}

export async function unloadComponent(key: string): Promise<boolean> {
  if (!loadedComponents.has(key)) return false;
  loadedComponents.delete(key);

  await triggerHook("component.unload", {
    scope: key,
    summary: `unloaded component: ${key}`,
  });

  return true;
}

export async function getSummary(key: string): Promise<string | null> {
  const [type, ...rest] = key.split("/");
  return readMarkdown(paths.componentSummary(type, rest.join("/")));
}

export async function updateSummary(key: string, content: string): Promise<void> {
  const [type, ...rest] = key.split("/");
  const name = rest.join("/");
  await writeMarkdown(paths.componentSummary(type, name), content);

  const dateStr = formatIndexDate();
  const tag = TYPE_TAG_MAP[type as ComponentType] ?? "P";
  await updateIndexEntry(tag, name, `★ active | ⟳${dateStr}`);

  await triggerHook("summary.update", {
    scope: key,
    summary: `summary updated: ${key}`,
  });
}

export function getLoadedComponents(): string[] {
  return [...loadedComponents];
}
