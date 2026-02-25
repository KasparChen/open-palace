/**
 * Data directory initialization.
 * Creates the full ~/.open-palace/ structure on first run.
 */

import fs from "node:fs/promises";
import { paths } from "../utils/paths.js";
import { writeYaml, writeMarkdown } from "../utils/yaml.js";
import { initGitRepo } from "./git.js";
import type { PalaceConfig } from "../types.js";

const DEFAULT_CONFIG: PalaceConfig = {
  version: "0.1.0",
  data_dir: "~/.open-palace",
  librarian: {
    schedules: {
      digest: { interval: "daily", time: "02:00" },
      synthesis: { interval: "weekly", time: "Sun 03:00" },
      review: { interval: "monthly", time: "1st 04:00" },
    },
    llm: { model: "claude-sonnet" },
  },
};

const DEFAULT_MASTER_INDEX = `# Open Palace — Master Index (L0)

> Auto-generated. Managed by Librarian.

\`\`\`
# [P]=Project [K]=Knowledge [S]=System [C]=Component [R]=Relationship
# ★=active ○=paused ●=done ✕=blocked  ⟳=last_updated →=focus ⚑=blocker

[S] librarian | cron:daily | last:- | scope:all
[S] health_check | cron:weekly | last:- | status:ok
\`\`\`
`;

const REQUIRED_DIRS = [
  () => paths.root(),
  () => `${paths.root()}/index`,
  () => paths.weeklyDir(),
  () => paths.monthlyDir(),
  () => paths.entitiesDir(),
  () => paths.componentsDir(),
  () => `${paths.componentsDir()}/projects`,
  () => `${paths.componentsDir()}/knowledge`,
  () => `${paths.componentsDir()}/skills`,
  () => `${paths.componentsDir()}/relationships`,
  () => paths.changelogsDir(),
  () => paths.syncDir(),
];

export async function initDataDirectory(): Promise<{ created: boolean }> {
  let created = false;

  try {
    await fs.access(paths.config());
  } catch {
    created = true;
  }

  for (const dirFn of REQUIRED_DIRS) {
    await fs.mkdir(dirFn(), { recursive: true });
  }

  if (created) {
    await writeYaml(paths.config(), DEFAULT_CONFIG);
    await writeMarkdown(paths.masterIndex(), DEFAULT_MASTER_INDEX);
  }

  await initGitRepo();
  return { created };
}
