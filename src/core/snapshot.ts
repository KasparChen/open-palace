/**
 * Context Snapshot — real-time state snapshot for compaction recovery.
 *
 * Unlike Scratch (append-only working memory), Snapshot is overwrite-only:
 * it always reflects the current state. Agent reads it first after
 * compaction or session start to instantly rebuild working context.
 */

import { paths } from "../utils/paths.js";
import { readYaml, writeYaml } from "../utils/yaml.js";
import { isoNow } from "../utils/id.js";
import { triggerHook } from "./posthook.js";
import type { Snapshot } from "../types.js";

export async function saveSnapshot(
  input: Partial<Snapshot> & { current_focus: string }
): Promise<Snapshot> {
  const existing = await readSnapshot();

  const snapshot: Snapshot = {
    updated_at: isoNow(),
    updated_by: input.updated_by ?? existing?.updated_by,
    current_focus: input.current_focus,
    active_tasks: input.active_tasks ?? existing?.active_tasks ?? [],
    blockers: input.blockers ?? existing?.blockers ?? [],
    recent_decisions: input.recent_decisions ?? existing?.recent_decisions ?? [],
    context_notes: input.context_notes ?? existing?.context_notes ?? "",
    session_meta: input.session_meta ?? existing?.session_meta,
  };

  await writeYaml(paths.snapshot(), snapshot);

  await triggerHook("snapshot.save", {
    scope: "snapshot",
    summary: `snapshot saved: ${snapshot.current_focus.slice(0, 50)}`,
  });

  return snapshot;
}

export async function readSnapshot(): Promise<Snapshot | null> {
  return readYaml<Snapshot>(paths.snapshot());
}
