/**
 * Scratchpad — zero-friction working memory layer.
 *
 * Sits between volatile session context and structured components.
 * Agent writes insights here instantly (no scope/type required).
 * Librarian later suggests promoting entries to proper components.
 *
 * Storage: ~/.open-palace/scratch/YYYY-MM-DD.yaml
 */

import { readFileSync } from "node:fs";
import { paths } from "../utils/paths.js";
import { readYaml, writeYaml } from "../utils/yaml.js";
import { isoNow } from "../utils/id.js";
import { triggerHook } from "./posthook.js";
import type { ScratchEntry } from "../types.js";

function todayStr(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function yesterdayStr(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

let dayCounter = 0;
let dayCounterDate = "";

function generateScratchId(): string {
  const today = todayStr().replace(/-/g, "").slice(4); // MMDD
  if (dayCounterDate !== today) {
    dayCounterDate = today;
    dayCounter = 0;

    // Scan existing file to recover counter across process restarts
    try {
      const content = readFileSync(paths.scratchFile(todayStr()), "utf-8");
      const pattern = new RegExp(`s_${today}_(\\d{3})`, "g");
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(content)) !== null) {
        const num = parseInt(match[1], 10);
        if (num > dayCounter) dayCounter = num;
      }
    } catch {
      // File doesn't exist yet
    }
  }
  dayCounter++;
  return `s_${today}_${String(dayCounter).padStart(3, "0")}`;
}

async function readDayEntries(date: string): Promise<ScratchEntry[]> {
  const data = await readYaml<ScratchEntry[]>(paths.scratchFile(date));
  return data ?? [];
}

async function writeDayEntries(
  date: string,
  entries: ScratchEntry[]
): Promise<void> {
  await writeYaml(paths.scratchFile(date), entries);
}

export interface ScratchWriteInput {
  content: string;
  tags?: string[];
  source?: string;
}

export async function writeScratch(
  input: ScratchWriteInput
): Promise<ScratchEntry> {
  const date = todayStr();
  const entry: ScratchEntry = {
    id: generateScratchId(),
    time: isoNow(),
    content: input.content,
    tags: input.tags?.length ? input.tags : undefined,
    source: input.source ?? "agent",
  };

  const entries = await readDayEntries(date);
  entries.push(entry);
  await writeDayEntries(date, entries);

  await triggerHook("scratch.write", {
    scope: "scratch",
    summary: `scratch: ${entry.id}`,
    entry_id: entry.id,
  });

  return entry;
}

export interface ScratchReadInput {
  date?: string;
  tags?: string[];
  include_yesterday?: boolean;
  limit?: number;
  exclude_promoted?: boolean;
}

export async function readScratch(
  input: ScratchReadInput
): Promise<ScratchEntry[]> {
  const targetDate = input.date ?? todayStr();
  let entries = await readDayEntries(targetDate);

  if (input.include_yesterday && !input.date) {
    const yesterday = await readDayEntries(yesterdayStr());
    entries = [...yesterday, ...entries];
  }

  if (input.exclude_promoted !== false) {
    entries = entries.filter((e) => !e.promoted_to);
  }

  if (input.tags?.length) {
    entries = entries.filter(
      (e) => e.tags && input.tags!.some((t) => e.tags!.includes(t))
    );
  }

  entries.sort(
    (a, b) => new Date(b.time).getTime() - new Date(a.time).getTime()
  );

  if (input.limit) {
    entries = entries.slice(0, input.limit);
  }

  return entries;
}

export async function promoteScratch(
  scratchId: string,
  scope: string
): Promise<{ success: boolean; message: string }> {
  // Find the entry across recent files (today + yesterday)
  for (const date of [todayStr(), yesterdayStr()]) {
    const entries = await readDayEntries(date);
    const idx = entries.findIndex((e) => e.id === scratchId);
    if (idx === -1) continue;

    if (entries[idx].promoted_to) {
      return {
        success: false,
        message: `Already promoted to ${entries[idx].promoted_to}`,
      };
    }

    entries[idx].promoted_to = scope;
    await writeDayEntries(date, entries);

    await triggerHook("scratch.promote", {
      scope: "scratch",
      summary: `promoted ${scratchId} → ${scope}`,
      entry_id: scratchId,
      target_scope: scope,
    });

    return {
      success: true,
      message: `Promoted ${scratchId} to ${scope}. Use mp_changelog_record to add it as a formal entry.`,
    };
  }

  return { success: false, message: `Scratch entry not found: ${scratchId}` };
}

/**
 * Get scratch stats for L0 index awareness.
 */
export async function scratchStats(): Promise<{
  today_count: number;
  yesterday_count: number;
  unpromoted: number;
}> {
  const today = await readDayEntries(todayStr());
  const yesterday = await readDayEntries(yesterdayStr());
  const allRecent = [...today, ...yesterday];
  return {
    today_count: today.length,
    yesterday_count: yesterday.length,
    unpromoted: allRecent.filter((e) => !e.promoted_to).length,
  };
}
