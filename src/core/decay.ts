/**
 * Memory Decay Engine — temperature-based active forgetting.
 *
 * Inspired by Ray Wang's temperature model and Ebbinghaus forgetting curve.
 * Cold data is archived (not deleted) to reduce retrieval noise.
 *
 * Safety: never archives entries newer than Librarian's safe_watermark.
 */

import fs from "node:fs/promises";
import { paths } from "../utils/paths.js";
import { readYaml, writeYaml } from "../utils/yaml.js";
import { isoNow } from "../utils/id.js";
import { gitCommit } from "./git.js";
import { getConfig, updateConfig } from "./config.js";
import { getSafeWatermark } from "./librarian.js";
import { registerSystem, type SystemRunResult } from "./system.js";
import type {
  ChangelogEntry,
  ComponentType,
  DecayConfig,
  DecayState,
  AccessLog,
  ArchiveRecord,
} from "../types.js";

// ─── Access Log ──────────────────────────────────────────

export async function updateAccessLog(key: string): Promise<void> {
  const log = (await readYaml<AccessLog>(paths.accessLog())) ?? {};
  const existing = log[key] ?? { last_accessed: "", access_count: 0 };
  log[key] = {
    last_accessed: isoNow(),
    access_count: existing.access_count + 1,
  };
  await writeYaml(paths.accessLog(), log);
}

async function getAccessLog(): Promise<AccessLog> {
  return (await readYaml<AccessLog>(paths.accessLog())) ?? {};
}

// ─── Decay State ─────────────────────────────────────────

async function getDecayState(): Promise<DecayState> {
  const data = await readYaml<DecayState>(paths.decayState());
  return data ?? {
    entries_archived: 0,
    entries_preserved: 0,
    archive_history: [],
  };
}

async function saveDecayState(state: DecayState): Promise<void> {
  await writeYaml(paths.decayState(), state);
}

// ─── Temperature Calculation ─────────────────────────────

function daysSince(isoDate: string): number {
  return Math.max(
    0,
    (Date.now() - new Date(isoDate).getTime()) / (1000 * 60 * 60 * 24)
  );
}

function ageBaseScore(days: number): number {
  if (days < 7) return 100;
  if (days < 30) return 80;
  if (days < 60) return 50;
  if (days < 90) return 20;
  return 5;
}

export function calculateTemperature(
  entry: ChangelogEntry,
  accessLog: AccessLog,
  pinnedEntries: string[]
): { temperature: number; breakdown: Record<string, number> } {
  if (pinnedEntries.includes(entry.id)) {
    return {
      temperature: 999,
      breakdown: { pin_bonus: 999 },
    };
  }

  const days = daysSince(entry.time);
  const base = ageBaseScore(days);

  const accessKey = `entry:${entry.id}`;
  const accessInfo = accessLog[accessKey];
  const accessBonus = Math.min(
    50,
    (accessInfo?.access_count ?? 0) * 10
  );

  // Components that contain this entry get a reference check
  const compAccessKey = `component:${entry.scope}`;
  const compAccessInfo = accessLog[compAccessKey];
  const referenceBonus = (compAccessInfo?.access_count ?? 0) > 0 ? 20 : 0;

  const temperature = base + accessBonus + referenceBonus;

  return {
    temperature,
    breakdown: {
      age_base: base,
      access_bonus: accessBonus,
      reference_bonus: referenceBonus,
    },
  };
}

// ─── Decay Preview ───────────────────────────────────────

export interface DecayCandidate {
  entry: ChangelogEntry;
  temperature: number;
  breakdown: Record<string, number>;
  component: string;
}

export async function getDecayPreview(
  thresholdOverride?: number
): Promise<SystemRunResult> {
  const startTime = Date.now();
  const config = await getConfig();
  const decayCfg = getDecayConfig(config.decay);

  if (!decayCfg.enabled) {
    return {
      success: true,
      message: "Memory decay is disabled in config",
      duration_ms: Date.now() - startTime,
    };
  }

  const threshold = thresholdOverride ?? decayCfg.archive_threshold;
  const watermark = await getSafeWatermark();
  const accessLog = await getAccessLog();
  const candidates = await collectCandidates(
    decayCfg,
    accessLog,
    watermark,
    threshold
  );

  return {
    success: true,
    message: `Decay preview: ${candidates.length} archive candidate(s) below threshold ${threshold}`,
    details: {
      threshold,
      safe_watermark: watermark ?? "none (Librarian has not run yet)",
      candidates: candidates.map((c) => ({
        entry_id: c.entry.id,
        component: c.component,
        age_days: Math.round(daysSince(c.entry.time)),
        temperature: c.temperature,
        breakdown: c.breakdown,
        summary: c.entry.summary?.slice(0, 80),
      })),
    },
    duration_ms: Date.now() - startTime,
  };
}

// ─── Run Decay ───────────────────────────────────────────

async function runDecay(
  params?: Record<string, unknown>
): Promise<SystemRunResult> {
  const startTime = Date.now();

  if (params?.dry_run === true) {
    return getDecayPreview(params?.threshold as number | undefined);
  }

  const config = await getConfig();
  const decayCfg = getDecayConfig(config.decay);

  if (!decayCfg.enabled) {
    return {
      success: true,
      message: "Memory decay is disabled in config",
      duration_ms: Date.now() - startTime,
    };
  }

  const watermark = await getSafeWatermark();
  const accessLog = await getAccessLog();
  const candidates = await collectCandidates(
    decayCfg,
    accessLog,
    watermark,
    decayCfg.archive_threshold
  );

  if (candidates.length === 0) {
    const decayState = await getDecayState();
    decayState.last_run = isoNow();
    decayState.last_result = "success";
    await saveDecayState(decayState);

    return {
      success: true,
      message: "No entries to archive (all above threshold or protected by watermark)",
      duration_ms: Date.now() - startTime,
    };
  }

  // Group candidates by component
  const byComponent = new Map<string, ChangelogEntry[]>();
  for (const c of candidates) {
    const existing = byComponent.get(c.component) ?? [];
    existing.push(c.entry);
    byComponent.set(c.component, existing);
  }

  let totalMoved = 0;
  const componentsAffected: string[] = [];

  for (const [compKey, entries] of byComponent) {
    const [type, key] = compKey.split("/");
    const changelogPath = paths.componentChangelog(type, key);
    const currentEntries =
      (await readYaml<ChangelogEntry[]>(changelogPath)) ?? [];

    const archiveIds = new Set(entries.map((e) => e.id));
    const remaining = currentEntries.filter((e) => !archiveIds.has(e.id));
    const archived = currentEntries.filter((e) => archiveIds.has(e.id));

    if (archived.length === 0) continue;

    // Write archived entries to archive directory
    const archiveDir = paths.archiveComponentDir(type, key);
    await fs.mkdir(archiveDir, { recursive: true });
    const archiveMonth = new Date().toISOString().slice(0, 7);
    const archivePath = `${archiveDir}/changelog-archived-${archiveMonth}.yaml`;
    const existingArchive =
      (await readYaml<ChangelogEntry[]>(archivePath)) ?? [];
    existingArchive.push(...archived);
    await writeYaml(archivePath, existingArchive);

    // Update original changelog (remove archived entries)
    await writeYaml(changelogPath, remaining);

    totalMoved += archived.length;
    componentsAffected.push(compKey);
  }

  // Update decay state
  const decayState = await getDecayState();
  decayState.last_run = isoNow();
  decayState.last_result = "success";
  decayState.entries_archived += totalMoved;

  const record: ArchiveRecord = {
    time: isoNow(),
    entries_moved: totalMoved,
    components_affected: componentsAffected,
    reason: "temperature_decay",
  };
  decayState.archive_history.push(record);

  // Keep archive history manageable (last 50 records)
  if (decayState.archive_history.length > 50) {
    decayState.archive_history = decayState.archive_history.slice(-50);
  }

  await saveDecayState(decayState);
  await gitCommit(
    `decay: archived ${totalMoved} entries from ${componentsAffected.length} component(s)`
  );

  return {
    success: true,
    message: `Archived ${totalMoved} entries from ${componentsAffected.length} component(s)`,
    details: {
      entries_moved: totalMoved,
      components_affected: componentsAffected,
      threshold: decayCfg.archive_threshold,
      safe_watermark: watermark,
    },
    duration_ms: Date.now() - startTime,
  };
}

// ─── Pin / Unpin ─────────────────────────────────────────

export async function pinEntry(
  entryId: string
): Promise<{ success: boolean; message: string }> {
  const config = await getConfig();
  const pinned = config.decay?.pinned_entries ?? [];

  if (pinned.includes(entryId)) {
    return { success: false, message: `Entry ${entryId} is already pinned` };
  }

  pinned.push(entryId);
  await updateConfig("decay.pinned_entries", pinned);
  return { success: true, message: `Pinned entry ${entryId} (will never be archived)` };
}

export async function unpinEntry(
  entryId: string
): Promise<{ success: boolean; message: string }> {
  const config = await getConfig();
  const pinned = config.decay?.pinned_entries ?? [];

  const idx = pinned.indexOf(entryId);
  if (idx === -1) {
    return { success: false, message: `Entry ${entryId} is not pinned` };
  }

  pinned.splice(idx, 1);
  await updateConfig("decay.pinned_entries", pinned);
  return { success: true, message: `Unpinned entry ${entryId}` };
}

// ─── Helpers ─────────────────────────────────────────────

function getDecayConfig(partial?: Partial<DecayConfig>): DecayConfig {
  return {
    enabled: partial?.enabled ?? true,
    archive_threshold: partial?.archive_threshold ?? 15,
    max_age_days: partial?.max_age_days ?? 30,
    pinned_entries: partial?.pinned_entries ?? [],
    exclude_types: partial?.exclude_types ?? [],
  };
}

async function collectCandidates(
  decayCfg: DecayConfig,
  accessLog: AccessLog,
  watermark: string | undefined,
  threshold: number
): Promise<DecayCandidate[]> {
  const types: ComponentType[] = ["projects", "knowledge", "skills", "relationships"];
  const candidates: DecayCandidate[] = [];

  for (const type of types) {
    if (decayCfg.exclude_types.includes(type)) continue;

    const dir = `${paths.componentsDir()}/${type}`;
    let entries: string[];
    try {
      entries = await fs.readdir(dir);
    } catch {
      continue;
    }

    for (const key of entries) {
      let stat;
      try {
        stat = await fs.stat(`${dir}/${key}`);
      } catch {
        continue;
      }
      if (!stat.isDirectory()) continue;

      const changelogPath = paths.componentChangelog(type, key);
      const allEntries =
        (await readYaml<ChangelogEntry[]>(changelogPath)) ?? [];

      for (const entry of allEntries) {
        const ageDays = daysSince(entry.time);
        if (ageDays < decayCfg.max_age_days) continue;

        // Safety: do not archive entries newer than safe_watermark
        if (watermark && entry.time > watermark) continue;

        const { temperature, breakdown } = calculateTemperature(
          entry,
          accessLog,
          decayCfg.pinned_entries
        );

        if (temperature < threshold) {
          candidates.push({
            entry,
            temperature,
            breakdown,
            component: `${type}/${key}`,
          });
        }
      }
    }
  }

  return candidates;
}

// ─── System Registration ─────────────────────────────────

export function registerDecaySystem(): void {
  registerSystem({
    name: "memory_decay",
    description:
      "Temperature-based memory archival: cold data → archive/. Respects Librarian safe_watermark.",
    default_trigger: "cron",
    execute: async (params) => runDecay(params),
  });
}
