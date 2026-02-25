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
