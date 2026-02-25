/**
 * ID generation utilities for changelog entries and operations.
 */

let counter = 0;

function pad(n: number, len: number): string {
  return String(n).padStart(len, "0");
}

export function generateId(prefix: "op" | "dec"): string {
  const now = new Date();
  const mmdd = `${pad(now.getMonth() + 1, 2)}${pad(now.getDate(), 2)}`;
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
