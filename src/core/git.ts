/**
 * Git operations for Open Palace data directory.
 * Every write operation gets version-controlled automatically.
 */

import { simpleGit, type SimpleGit } from "simple-git";
import { paths } from "../utils/paths.js";
import fs from "node:fs/promises";

let gitInstance: SimpleGit | null = null;

export async function getGit(): Promise<SimpleGit> {
  if (gitInstance) return gitInstance;
  gitInstance = simpleGit(paths.root());
  return gitInstance;
}

export async function initGitRepo(): Promise<void> {
  const root = paths.root();
  try {
    await fs.access(`${root}/.git`);
  } catch {
    const g = await getGit();
    await g.init();
    await g.addConfig("user.name", "Open Palace");
    await g.addConfig("user.email", "open-palace@local");

    const gitignore = "# Open Palace gitignore\n*.tmp\n*.log\n";
    await fs.writeFile(`${root}/.gitignore`, gitignore, "utf-8");
    await g.add(".");
    await g.commit("init: Open Palace data directory");
  }
}

export async function gitCommit(message: string): Promise<string | null> {
  try {
    const g = await getGit();
    await g.add(".");
    const status = await g.status();
    if (status.isClean()) return null;
    const result = await g.commit(message);
    return result.commit || null;
  } catch (err) {
    console.error("[git] commit failed:", err);
    return null;
  }
}

export async function gitLog(limit = 10) {
  const g = await getGit();
  return g.log({ maxCount: limit });
}
