/**
 * Configuration management for Open Palace.
 * Reads/writes ~/.open-palace/config.yaml with dot-path access.
 */

import type { PalaceConfig } from "../types.js";
import { paths } from "../utils/paths.js";
import { readYaml, writeYaml } from "../utils/yaml.js";

let cachedConfig: PalaceConfig | null = null;

export async function getConfig(): Promise<PalaceConfig> {
  if (cachedConfig) return cachedConfig;
  const config = await readYaml<PalaceConfig>(paths.config());
  if (!config) throw new Error("Config not found. Run init first.");
  cachedConfig = config;
  return config;
}

export async function updateConfig(dotPath: string, value: unknown): Promise<PalaceConfig> {
  const config = await getConfig();
  setNestedValue(config as unknown as Record<string, unknown>, dotPath, value);
  await writeYaml(paths.config(), config);
  cachedConfig = config;
  return config;
}

export function invalidateConfigCache(): void {
  cachedConfig = null;
}

function setNestedValue(obj: Record<string, unknown>, dotPath: string, value: unknown): void {
  const keys = dotPath.split(".");
  let current: Record<string, unknown> = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    if (!(key in current) || typeof current[key] !== "object" || current[key] === null) {
      current[key] = {};
    }
    current = current[key] as Record<string, unknown>;
  }
  current[keys[keys.length - 1]] = value;
}

function getNestedValue(obj: Record<string, unknown>, dotPath: string): unknown {
  const keys = dotPath.split(".");
  let current: unknown = obj;
  for (const key of keys) {
    if (current === null || current === undefined || typeof current !== "object") {
      return undefined;
    }
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

export async function getConfigValue(dotPath?: string): Promise<unknown> {
  const config = await getConfig();
  if (!dotPath) return config;
  return getNestedValue(config as unknown as Record<string, unknown>, dotPath);
}
