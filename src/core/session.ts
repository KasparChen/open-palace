/**
 * Session Guard — code-level guarantee for startup context injection.
 *
 * Tracks whether the current MCP session has loaded startup context.
 * On the first tool call of any session, automatically prepends the
 * L0 Master Index + snapshot summary to the response. This ensures
 * the agent always has awareness, even if it skips the startup ritual.
 *
 * Design principle: Engineering pipelines > Prompt instructions.
 */

import { getMasterIndex } from "./index.js";
import { readSnapshot } from "./snapshot.js";
import { readScratch } from "./scratch.js";
import type { Snapshot, ScratchEntry } from "../types.js";

let sessionInitialized = false;

export function isSessionStarted(): boolean {
  return sessionInitialized;
}

export function markSessionStarted(): void {
  sessionInitialized = true;
}

/**
 * Build the auto-inject preamble for first tool contact.
 * Returns null if session is already initialized.
 * Compact format: L0 index + snapshot headline (keeps it under ~600 tokens).
 */
export async function getAutoInjectPreamble(): Promise<string | null> {
  if (sessionInitialized) return null;
  sessionInitialized = true;

  const index = await getMasterIndex();
  const snapshot = await readSnapshot();

  let preamble = "--- Open Palace: Session Context (auto-injected) ---\n\n";
  preamble += index;

  if (snapshot) {
    preamble += "\n\n## Working State (Snapshot)\n";
    preamble += `Focus: ${snapshot.current_focus}\n`;
    if (snapshot.active_tasks.length > 0) {
      preamble += `Active tasks: ${snapshot.active_tasks.map((t) => t.description).join("; ")}\n`;
    }
    if (snapshot.blockers.length > 0) {
      preamble += `Blockers: ${snapshot.blockers.join("; ")}\n`;
    }
    if (snapshot.context_notes) {
      preamble += `Notes: ${snapshot.context_notes}\n`;
    }
  }

  preamble +=
    "\n--- End auto-injected context. Use mp_session_start for full startup. ---\n";

  return preamble;
}

/**
 * Build the full startup context for mp_session_start.
 * Returns L0 index + snapshot + recent scratch entries.
 */
export async function getFullStartupContext(): Promise<string> {
  markSessionStarted();

  const index = await getMasterIndex();
  const snapshot = await readSnapshot();
  const scratch = await readScratch({ include_yesterday: true, limit: 20 });

  let context = "# Open Palace — Session Startup\n\n";

  // L0 Master Index
  context += "## L0 Master Index\n\n";
  context += index;

  // Snapshot
  if (snapshot) {
    context += "\n\n## Working State (Snapshot)\n\n";
    context += formatSnapshot(snapshot);
  } else {
    context += "\n\n## Working State\n\nNo snapshot saved yet. ";
    context +=
      "Use `mp_snapshot_save` before ending long sessions or compaction.\n";
  }

  // Recent scratch
  if (scratch.length > 0) {
    context += "\n\n## Recent Scratch Notes\n\n";
    context += formatScratchEntries(scratch);
  } else {
    context += "\n\n## Scratch\n\nNo recent scratch entries.\n";
  }

  // Usage reminder
  context += "\n---\n\n";
  context += "**During this session:**\n";
  context +=
    "- Capture insights → `mp_scratch_write` (NEVER write to files)\n";
  context +=
    "- Record decisions → `mp_changelog_record` (with rationale + alternatives)\n";
  context += "- Load project details → `mp_component_load`\n";
  context +=
    "- Before compaction/end → `mp_snapshot_save`\n";

  return context;
}

function formatSnapshot(snapshot: Snapshot): string {
  let s = `**Focus:** ${snapshot.current_focus}\n`;
  s += `**Updated:** ${snapshot.updated_at}\n`;

  if (snapshot.active_tasks.length > 0) {
    s += "\n**Active tasks:**\n";
    for (const task of snapshot.active_tasks) {
      const priority = task.priority ? ` [${task.priority}]` : "";
      s += `- ${task.description} (${task.status}${priority})\n`;
    }
  }

  if (snapshot.blockers.length > 0) {
    s += "\n**Blockers:**\n";
    for (const b of snapshot.blockers) {
      s += `- ${b}\n`;
    }
  }

  if (snapshot.recent_decisions.length > 0) {
    s += "\n**Recent decisions:**\n";
    for (const d of snapshot.recent_decisions) {
      s += `- ${d}\n`;
    }
  }

  if (snapshot.context_notes) {
    s += `\n**Notes:** ${snapshot.context_notes}\n`;
  }

  return s;
}

function formatScratchEntries(entries: ScratchEntry[]): string {
  return entries
    .map((e) => {
      const tags = e.tags?.length ? ` [${e.tags.join(", ")}]` : "";
      return `- **${e.id}** (${e.time})${tags}: ${e.content}`;
    })
    .join("\n");
}
