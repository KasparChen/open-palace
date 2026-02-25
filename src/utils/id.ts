/**
 * ID generation utilities for changelog entries and operations.
 *
 * Counter persists across process restarts by scanning existing
 * changelogs on first use each day.
 */

import fs from "node:fs";
import { paths } from "./paths.js";

let counter = 0;
let counterDate = ""; // MMDD string for current counter

function pad(n: number, len: number): string {
  return String(n).padStart(len, "0");
}

/**
 * Scan global changelog to find the highest ID counter for today,
 * so IDs continue incrementing across process restarts.
 */
function ensureCounterInitialized(mmdd: string): void {
  if (counterDate === mmdd) return;

  counterDate = mmdd;
  counter = 0;

  const ym = yearMonth();
  const globalPath = paths.globalChangelog(ym);

  try {
    const content = fs.readFileSync(globalPath, "utf-8");
    // Match patterns like op_0225_003 or dec_0225_017
    const pattern = new RegExp(`(?:op|dec)_${mmdd}_(\\d{3})`, "g");
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(content)) !== null) {
      const num = parseInt(match[1], 10);
      if (num > counter) counter = num;
    }
  } catch {
    // File doesn't exist yet — start from 0
  }
}

export function generateId(prefix: "op" | "dec"): string {
  const now = new Date();
  const mmdd = `${pad(now.getMonth() + 1, 2)}${pad(now.getDate(), 2)}`;
  ensureCounterInitialized(mmdd);
  counter++;
  return `${prefix}_${mmdd}_${pad(counter, 3)}`;
}

export function isoNow(): string {
  return new Date().toISOString();
}

export function yearMonth(date?: Date): string {
  const d = date ?? new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1, 2)}`;
}
