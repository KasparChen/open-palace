/**
 * Centralized path resolution for Open Palace data directory.
 * All data lives under ~/.open-palace/ by default.
 */

import path from "node:path";
import os from "node:os";

let dataDir: string | null = null;

export function setDataDir(dir: string): void {
  dataDir = dir;
}

export function getDataDir(): string {
  if (dataDir) return dataDir;
  return path.join(os.homedir(), ".open-palace");
}

export const paths = {
  root: () => getDataDir(),
  config: () => path.join(getDataDir(), "config.yaml"),
  gitDir: () => path.join(getDataDir(), ".git"),

  // Index
  masterIndex: () => path.join(getDataDir(), "index", "master.md"),
  weeklyDir: () => path.join(getDataDir(), "index", "weekly"),
  monthlyDir: () => path.join(getDataDir(), "index", "monthly"),

  // Entities
  entitiesDir: () => path.join(getDataDir(), "entities"),
  entity: (id: string) => path.join(getDataDir(), "entities", `${id}.yaml`),

  // Components
  componentsDir: () => path.join(getDataDir(), "components"),
  componentDir: (type: string, key: string) =>
    path.join(getDataDir(), "components", type, key),
  componentSummary: (type: string, key: string) =>
    path.join(getDataDir(), "components", type, key, "summary.md"),
  componentChangelog: (type: string, key: string) =>
    path.join(getDataDir(), "components", type, key, "changelog.yaml"),
  componentRawDir: (type: string, key: string) =>
    path.join(getDataDir(), "components", type, key, "raw"),

  // Global changelogs
  changelogsDir: () => path.join(getDataDir(), "changelogs"),
  globalChangelog: (yearMonth: string) =>
    path.join(getDataDir(), "changelogs", `${yearMonth}.yaml`),

  // Sync
  syncDir: () => path.join(getDataDir(), "sync"),
  syncHostDir: (host: string) => path.join(getDataDir(), "sync", host),
  syncMappings: (host: string) =>
    path.join(getDataDir(), "sync", host, "mappings.yaml"),
  syncState: (host: string) =>
    path.join(getDataDir(), "sync", host, "sync-state.yaml"),
};
