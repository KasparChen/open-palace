/**
 * System Store — executable pipeline registry.
 *
 * Systems are code-level pipelines, not prompt instructions.
 * Each system has: execute logic, state tracking, and configurable triggers.
 */

import { paths } from "../utils/paths.js";
import { readYaml, writeYaml } from "../utils/yaml.js";
import { isoNow } from "../utils/id.js";
import { gitCommit } from "./git.js";
import { getConfigValue } from "./config.js";

export interface SystemRunResult {
  success: boolean;
  message: string;
  details?: Record<string, unknown>;
  duration_ms: number;
}

export interface SystemState {
  last_run?: string;
  last_result?: "success" | "error";
  last_message?: string;
  run_count: number;
  pending_items?: number;
}

export interface SystemRegistration {
  name: string;
  description: string;
  default_trigger: "cron" | "on_demand" | "event";
  execute: (params?: Record<string, unknown>) => Promise<SystemRunResult>;
}

const registry = new Map<string, SystemRegistration>();
const stateMap = new Map<string, SystemState>();

function statePath(): string {
  return `${paths.root()}/system-state.yaml`;
}

export async function loadSystemStates(): Promise<void> {
  const data = await readYaml<Record<string, SystemState>>(statePath());
  if (data) {
    for (const [name, state] of Object.entries(data)) {
      stateMap.set(name, state);
    }
  }
}

async function saveSystemStates(): Promise<void> {
  const data: Record<string, SystemState> = {};
  for (const [name, state] of stateMap) {
    data[name] = state;
  }
  await writeYaml(statePath(), data);
}

export function registerSystem(reg: SystemRegistration): void {
  registry.set(reg.name, reg);
  if (!stateMap.has(reg.name)) {
    stateMap.set(reg.name, { run_count: 0 });
  }
}

export function listSystems(): Array<{
  name: string;
  description: string;
  default_trigger: string;
  state: SystemState;
}> {
  const result: Array<{
    name: string;
    description: string;
    default_trigger: string;
    state: SystemState;
  }> = [];
  for (const [name, reg] of registry) {
    result.push({
      name,
      description: reg.description,
      default_trigger: reg.default_trigger,
      state: stateMap.get(name) ?? { run_count: 0 },
    });
  }
  return result;
}

export async function executeSystem(
  name: string,
  params?: Record<string, unknown>
): Promise<SystemRunResult> {
  const reg = registry.get(name);
  if (!reg) {
    return { success: false, message: `System not found: ${name}`, duration_ms: 0 };
  }

  const startTime = Date.now();
  let result: SystemRunResult;

  try {
    result = await reg.execute(params);
  } catch (err) {
    result = {
      success: false,
      message: `System error: ${err instanceof Error ? err.message : String(err)}`,
      duration_ms: Date.now() - startTime,
    };
  }

  result.duration_ms = Date.now() - startTime;

  const state = stateMap.get(name) ?? { run_count: 0 };
  state.last_run = isoNow();
  state.last_result = result.success ? "success" : "error";
  state.last_message = result.message;
  state.run_count++;
  stateMap.set(name, state);

  await saveSystemStates();
  return result;
}

export function getSystemState(name: string): SystemState | null {
  return stateMap.get(name) ?? null;
}

export function getSystem(name: string): SystemRegistration | undefined {
  return registry.get(name);
}

// ─── Overdue / Schedule helpers ─────────────────

const INTERVAL_MS: Record<string, number> = {
  hourly: 60 * 60 * 1000,
  daily: 24 * 60 * 60 * 1000,
  weekly: 7 * 24 * 60 * 60 * 1000,
  monthly: 30 * 24 * 60 * 60 * 1000,
};

/**
 * Resolve the configured interval string for a system sub-task.
 */
async function resolveInterval(configPath: string, fallback: string): Promise<string> {
  if (!configPath) return fallback;
  try {
    const val = await getConfigValue(configPath);
    return typeof val === "string" ? val : fallback;
  } catch {
    return fallback;
  }
}

/**
 * Resolve the configured interval for a system sub-task.
 * Returns milliseconds, or null if set to "manual".
 */
async function resolveIntervalMs(configPath: string, fallback: string): Promise<number | null> {
  const interval = await resolveInterval(configPath, fallback);
  if (interval === "manual") return null;
  return INTERVAL_MS[interval] ?? INTERVAL_MS[fallback] ?? null;
}

export interface ScheduleInfo {
  schedule: string;
  interval_ms: number | null;
  next_due: string | null;
  overdue: boolean;
  overdue_by: string | null;
}

/**
 * Compute schedule status for a system based on its config interval and last_run.
 */
export async function getScheduleInfo(
  name: string,
  configPath: string,
  fallback: string
): Promise<ScheduleInfo> {
  const interval = await resolveInterval(configPath, fallback);
  const intervalMs = await resolveIntervalMs(configPath, fallback);

  const state = stateMap.get(name);
  if (!intervalMs || interval === "manual") {
    return { schedule: interval, interval_ms: intervalMs, next_due: null, overdue: false, overdue_by: null };
  }

  if (!state?.last_run) {
    return { schedule: interval, interval_ms: intervalMs, next_due: "now", overdue: true, overdue_by: "never run" };
  }

  const lastRun = new Date(state.last_run).getTime();
  const nextDue = lastRun + intervalMs;
  const now = Date.now();
  const isOverdue = now > nextDue;

  let overdueBy: string | null = null;
  if (isOverdue) {
    const diffMs = now - nextDue;
    const hours = Math.floor(diffMs / (60 * 60 * 1000));
    const days = Math.floor(hours / 24);
    overdueBy = days > 0 ? `${days}d ${hours % 24}h` : `${hours}h`;
  }

  return {
    schedule: interval,
    interval_ms: intervalMs,
    next_due: new Date(nextDue).toISOString(),
    overdue: isOverdue,
    overdue_by: overdueBy,
  };
}

/** Known cron system sub-tasks and their config paths + default intervals. */
const CRON_TASKS: Array<{
  systemName: string;
  configPath: string;
  fallback: string;
  params?: Record<string, unknown>;
}> = [
  { systemName: "librarian", configPath: "librarian.schedules.digest.interval", fallback: "daily", params: { level: "digest" } },
  { systemName: "librarian", configPath: "librarian.schedules.synthesis.interval", fallback: "weekly", params: { level: "synthesis" } },
  { systemName: "health_check", configPath: "", fallback: "weekly" },
  { systemName: "memory_decay", configPath: "", fallback: "weekly" },
];

/**
 * Check all cron-triggered systems at startup. Execute any that are overdue.
 * Non-blocking: each system failure is caught individually.
 */
export async function runOverdueSystems(): Promise<{ executed: string[]; skipped: string[] }> {
  const executed: string[] = [];
  const skipped: string[] = [];

  for (const task of CRON_TASKS) {
    const configPath = task.configPath || undefined;
    const intervalMs = configPath
      ? await resolveIntervalMs(configPath, task.fallback)
      : INTERVAL_MS[task.fallback] ?? null;

    if (!intervalMs) {
      skipped.push(`${task.systemName}(manual)`);
      continue;
    }

    const state = stateMap.get(task.systemName);
    const lastRun = state?.last_run ? new Date(state.last_run).getTime() : 0;
    const now = Date.now();

    if (now - lastRun > intervalMs) {
      try {
        const label = task.params
          ? `${task.systemName}:${(task.params as Record<string, string>).level ?? ""}`
          : task.systemName;
        console.error(`[open-palace] Running overdue system: ${label}`);
        await executeSystem(task.systemName, task.params);
        executed.push(label);
      } catch (err) {
        console.error(
          `[open-palace] Overdue system ${task.systemName} failed:`,
          err instanceof Error ? err.message : err
        );
      }
    } else {
      skipped.push(task.systemName);
    }
  }

  return { executed, skipped };
}
