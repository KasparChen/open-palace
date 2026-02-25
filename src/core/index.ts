/**
 * L0 Master Index — the global directory that fits in < 500 tokens.
 *
 * The Master Index provides awareness: agents don't carry detailed info,
 * they just know "what exists" and retrieve on demand.
 */

import { paths } from "../utils/paths.js";
import { readMarkdown, writeMarkdown } from "../utils/yaml.js";
import { triggerHook } from "./posthook.js";

export async function getMasterIndex(): Promise<string> {
  const content = await readMarkdown(paths.masterIndex());
  return content ?? "# Open Palace — Master Index (L0)\n\n(empty)\n";
}

/**
 * Simple keyword search against L0 index content.
 * Returns matching lines from the master index.
 */
export async function searchIndex(
  query: string,
  _scope?: string
): Promise<string[]> {
  const content = await getMasterIndex();
  const lines = content.split("\n");
  const queryLower = query.toLowerCase();
  const matches = lines.filter(
    (line) => line.trim().length > 0 && line.toLowerCase().includes(queryLower)
  );
  return matches;
}

/**
 * Append or update an entry in the L0 master index code block.
 */
export async function updateIndexEntry(
  tag: string,
  key: string,
  statusLine: string
): Promise<void> {
  let content = await getMasterIndex();
  const entryPattern = new RegExp(`^\\[${tag}\\]\\s+${escapeRegex(key)}\\s.*$`, "m");
  const newLine = `[${tag}] ${key} | ${statusLine}`;

  if (entryPattern.test(content)) {
    content = content.replace(entryPattern, newLine);
  } else {
    // Insert before the comment legend line
    const legendPattern = /^# \[P\]=Project/m;
    if (legendPattern.test(content)) {
      content = content.replace(legendPattern, `${newLine}\n# [P]=Project`);
    } else {
      // Append inside the code block
      const lastBacktick = content.lastIndexOf("```");
      if (lastBacktick > 0) {
        content = content.slice(0, lastBacktick) + newLine + "\n```\n";
      } else {
        content += `\n${newLine}\n`;
      }
    }
  }

  await writeMarkdown(paths.masterIndex(), content);
  await triggerHook("index.update", {
    scope: "index/master",
    summary: `index updated: [${tag}] ${key}`,
  });
}

/**
 * Get a formatted date string for L0 index (MMDD format).
 */
export function formatIndexDate(date?: Date): string {
  const d = date ?? new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${mm}${dd}`;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
