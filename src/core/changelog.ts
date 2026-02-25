/**
 * Dual-layer changelog system.
 *
 * Operation logs: auto-generated via PostHook — records "what happened"
 * Decision logs: agent-initiated — records "why" with alternatives
 *
 * Double-write: every entry goes to both component-level and global changelog.
 */

import { paths } from "../utils/paths.js";
import { readYaml, appendYamlEntry } from "../utils/yaml.js";
import { generateId, isoNow, yearMonth } from "../utils/id.js";
import { triggerHook } from "./posthook.js";
import type { ChangelogEntry } from "../types.js";

export interface RecordInput {
  scope: string;
  type: "operation" | "decision";
  agent?: string;
  action?: string;
  target?: string;
  decision?: string;
  rationale?: string;
  alternatives?: { option: string; rejected_because: string }[];
  summary: string;
  details?: string;
}

export async function recordChangelog(input: RecordInput): Promise<ChangelogEntry> {
  const prefix = input.type === "operation" ? "op" : "dec";
  const entry: ChangelogEntry = {
    id: generateId(prefix),
    time: isoNow(),
    agent: input.agent,
    type: input.type,
    scope: input.scope,
    action: input.action,
    target: input.target,
    decision: input.decision,
    rationale: input.rationale,
    alternatives: input.alternatives,
    summary: input.summary,
    details: input.details,
  };

  // Write to component-level changelog if scope maps to a component
  const componentPath = resolveComponentChangelog(input.scope);
  if (componentPath) {
    await appendYamlEntry(componentPath, entry);
  }

  // Write to global changelog (always)
  const globalPath = paths.globalChangelog(yearMonth());
  await appendYamlEntry(globalPath, entry);

  await triggerHook("changelog.record", {
    scope: input.scope,
    summary: `${input.type}: ${input.summary}`,
    entry_id: entry.id,
  });

  return entry;
}

export interface QueryInput {
  scope?: string;
  type?: "operation" | "decision";
  time_range?: { from?: string; to?: string };
  agent?: string;
  limit?: number;
}

export async function queryChangelog(input: QueryInput): Promise<ChangelogEntry[]> {
  let entries: ChangelogEntry[] = [];

  if (input.scope) {
    const componentPath = resolveComponentChangelog(input.scope);
    if (componentPath) {
      const data = await readYaml<ChangelogEntry[]>(componentPath);
      entries = data ?? [];
    }
  } else {
    // Read from global changelog (current month)
    const globalPath = paths.globalChangelog(yearMonth());
    const data = await readYaml<ChangelogEntry[]>(globalPath);
    entries = data ?? [];
  }

  // Apply filters
  if (input.type) {
    entries = entries.filter((e) => e.type === input.type);
  }
  if (input.agent) {
    entries = entries.filter((e) => e.agent === input.agent);
  }
  if (input.time_range?.from) {
    const from = new Date(input.time_range.from);
    entries = entries.filter((e) => new Date(e.time) >= from);
  }
  if (input.time_range?.to) {
    const to = new Date(input.time_range.to);
    entries = entries.filter((e) => new Date(e.time) <= to);
  }

  // Sort by time descending
  entries.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());

  if (input.limit) {
    entries = entries.slice(0, input.limit);
  }

  return entries;
}

/**
 * Resolve a scope string like "projects/alpha" to the component changelog path.
 */
function resolveComponentChangelog(scope: string): string | null {
  const parts = scope.split("/");
  if (parts.length >= 2) {
    return paths.componentChangelog(parts[0], parts.slice(1).join("/"));
  }
  return null;
}
