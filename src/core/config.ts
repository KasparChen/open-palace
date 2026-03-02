/**
 * Configuration management for Open Palace.
 * Reads/writes ~/.open-palace/config.yaml with dot-path access.
 *
 * CONFIG_REFERENCE is the single source of truth for all configurable
 * parameters: default values, affected systems, code locations.
 */

import type { PalaceConfig } from "../types.js";
import { paths } from "../utils/paths.js";
import { readYaml, writeYaml } from "../utils/yaml.js";

// ─── Centralized Configuration Reference ─────────────────

export interface ConfigParamInfo {
  path: string;
  default_value: unknown;
  type: string;
  description: string;
  system: string;
  code_ref: string;
}

/**
 * All configurable parameters across the system, with annotations.
 * This is the single reference table for users and agents.
 */
export const CONFIG_REFERENCE: ConfigParamInfo[] = [
  // ─── Librarian ───
  {
    path: "librarian.schedules.digest.interval",
    default_value: "daily",
    type: "string (hourly|daily|weekly|monthly|manual)",
    description: "How often the Librarian runs digest (incremental L1 summary updates from changelogs)",
    system: "Librarian (Layer 1: Digest)",
    code_ref: "src/core/librarian.ts → runDigest()",
  },
  {
    path: "librarian.schedules.digest.time",
    default_value: "02:00",
    type: "string (HH:MM or cron-like)",
    description: "Preferred time for digest execution (informational, actual triggering is on-demand or host-scheduled)",
    system: "Librarian (Layer 1: Digest)",
    code_ref: "src/core/librarian.ts → runDigest()",
  },
  {
    path: "librarian.schedules.synthesis.interval",
    default_value: "weekly",
    type: "string (hourly|daily|weekly|monthly|manual)",
    description: "How often the Librarian runs cross-component synthesis analysis",
    system: "Librarian (Layer 2: Synthesis)",
    code_ref: "src/core/librarian.ts → runSynthesis()",
  },
  {
    path: "librarian.schedules.synthesis.time",
    default_value: "Sun 03:00",
    type: "string",
    description: "Preferred time for weekly synthesis execution",
    system: "Librarian (Layer 2: Synthesis)",
    code_ref: "src/core/librarian.ts → runSynthesis()",
  },
  {
    path: "librarian.schedules.review.interval",
    default_value: "monthly",
    type: "string (hourly|daily|weekly|monthly|manual)",
    description: "How often the Librarian rebuilds the full L0 index and generates monthly reports",
    system: "Librarian (Layer 3: Review)",
    code_ref: "src/core/librarian.ts → runReview()",
  },
  {
    path: "librarian.schedules.review.time",
    default_value: "1st 04:00",
    type: "string",
    description: "Preferred time for monthly review execution",
    system: "Librarian (Layer 3: Review)",
    code_ref: "src/core/librarian.ts → runReview()",
  },
  {
    path: "librarian.llm.model",
    default_value: "claude-sonnet",
    type: "string",
    description: "LLM model used by the Librarian for summarization tasks",
    system: "Librarian",
    code_ref: "src/core/llm.ts → askLLM()",
  },

  // ─── LLM ───
  {
    path: "llm.mode",
    default_value: "auto",
    type: "string (auto|sampling|direct)",
    description: "LLM call strategy: 'auto' tries MCP Sampling then falls back to direct API; 'sampling' uses host LLM only; 'direct' uses Anthropic API only",
    system: "LLM (affects Librarian, Validation, Retrieval+Digest)",
    code_ref: "src/core/llm.ts → callLLM()",
  },
  {
    path: "llm.model",
    default_value: "claude-sonnet-4-20250514",
    type: "string",
    description: "Model identifier for direct API calls (only used when llm.mode is 'direct' or 'auto' fallback)",
    system: "LLM",
    code_ref: "src/core/llm.ts → callViaDirect()",
  },
  {
    path: "llm.anthropic_api_key",
    default_value: null,
    type: "string | null",
    description: "Anthropic API key for direct mode. Can also be set via ANTHROPIC_API_KEY env variable",
    system: "LLM",
    code_ref: "src/core/llm.ts → callViaDirect()",
  },

  // ─── Memory Ingest ───
  {
    path: "memory_ingest.enabled",
    default_value: true,
    type: "boolean",
    description: "Enable/disable automatic ingestion of host workspace memory/*.md files into scratch",
    system: "Memory Ingest",
    code_ref: "src/core/memory-ingest.ts → runMemoryIngest()",
  },
  {
    path: "memory_ingest.pattern",
    default_value: "memory/*.md",
    type: "string (glob)",
    description: "File glob pattern (relative to workspace) for memory files to ingest",
    system: "Memory Ingest",
    code_ref: "src/core/memory-ingest.ts → runMemoryIngest()",
  },
  {
    path: "memory_ingest.auto_on_startup",
    default_value: true,
    type: "boolean",
    description: "Whether to run memory ingest automatically on MCP server startup",
    system: "Memory Ingest",
    code_ref: "src/index.ts → main()",
  },

  // ─── Memory Decay ───
  {
    path: "decay.enabled",
    default_value: true,
    type: "boolean",
    description: "Enable/disable the temperature-based memory decay engine. When disabled, no data is archived",
    system: "Memory Decay Engine",
    code_ref: "src/core/decay.ts → runDecay()",
  },
  {
    path: "decay.archive_threshold",
    default_value: 15,
    type: "number (0-100)",
    description: "Temperature score below which entries become archive candidates. Lower = more aggressive archival",
    system: "Memory Decay Engine",
    code_ref: "src/core/decay.ts → runDecay()",
  },
  {
    path: "decay.max_age_days",
    default_value: 30,
    type: "number",
    description: "Only changelog entries older than this many days are evaluated for decay. Protects recent data",
    system: "Memory Decay Engine",
    code_ref: "src/core/decay.ts → calculateTemperature()",
  },
  {
    path: "decay.pinned_entries",
    default_value: [],
    type: "string[]",
    description: "Entry IDs manually pinned to never be archived (temperature +999)",
    system: "Memory Decay Engine",
    code_ref: "src/core/decay.ts → calculateTemperature()",
  },
  {
    path: "decay.exclude_types",
    default_value: [],
    type: "string[] (component types to exclude)",
    description: "Component types excluded from decay evaluation entirely (e.g., 'relationships')",
    system: "Memory Decay Engine",
    code_ref: "src/core/decay.ts → runDecay()",
  },

  // ─── Write Validation ───
  {
    path: "validation.enabled",
    default_value: true,
    type: "boolean",
    description: "Enable/disable the write validation subsystem globally",
    system: "Write Validation (CRUD)",
    code_ref: "src/core/validation.ts → validateWrite()",
  },
  {
    path: "validation.auto_validate_decisions",
    default_value: true,
    type: "boolean",
    description: "Automatically validate 'decision' type changelog entries before writing (checks duplicates, contradictions)",
    system: "Write Validation (CRUD)",
    code_ref: "src/core/changelog.ts → recordChangelog()",
  },
  {
    path: "validation.auto_validate_summaries",
    default_value: false,
    type: "boolean",
    description: "Automatically validate summary updates before writing. Disabled by default to avoid slowing Librarian digests",
    system: "Write Validation (CRUD)",
    code_ref: "src/core/component.ts → updateSummary()",
  },

  // ─── Workspace Sync ───
  {
    path: "workspace_sync.host",
    default_value: "auto-detected",
    type: "string",
    description: "Host environment identifier (e.g., 'openclaw', 'cursor'). Auto-populated by onboarding",
    system: "Workspace Sync",
    code_ref: "src/core/sync.ts → syncWorkspace()",
  },
  {
    path: "workspace_sync.workspace_path",
    default_value: "auto-detected",
    type: "string (absolute path)",
    description: "Path to the host workspace directory. Auto-detected for OpenClaw/Cursor",
    system: "Workspace Sync",
    code_ref: "src/core/sync.ts → getWorkspacePath()",
  },
  {
    path: "workspace_sync.watched_files",
    default_value: ["SOUL.md", "IDENTITY.md", "USER.md", "AGENTS.md", "TOOLS.md"],
    type: "string[]",
    description: "Files to monitor for changes during workspace sync on startup",
    system: "Workspace Sync",
    code_ref: "src/core/sync.ts → syncWorkspace()",
  },
  {
    path: "workspace_sync.entity_mapping",
    default_value: { main: "main" },
    type: "Record<string, string>",
    description: "Mapping from host agent IDs to Open Palace entity IDs for SOUL sync",
    system: "Workspace Sync + Entity Registry",
    code_ref: "src/core/sync.ts → syncWorkspace()",
  },

  // ─── Search ───
  {
    path: "search.backend",
    default_value: "auto",
    type: "string (auto|qmd|orama|builtin)",
    description: "Search backend selection: 'auto' tries QMD → Orama → builtin scan; or force a specific backend",
    system: "Search (L2 RAG)",
    code_ref: "src/core/search.ts → getActiveBackend()",
  },
  {
    path: "search.qmd_index",
    default_value: "open-palace",
    type: "string",
    description: "Named QMD index for Open Palace data. Isolates our data from other QMD collections",
    system: "Search (QMD Backend)",
    code_ref: "src/core/search-qmd.ts → ensureCollection()",
  },
  {
    path: "search.auto_reindex",
    default_value: true,
    type: "boolean",
    description: "Automatically trigger reindex after write operations (debounced). Disable for manual control only",
    system: "Search (all backends)",
    code_ref: "src/core/search.ts → scheduleDebouncedReindex()",
  },
  {
    path: "search.reindex_debounce_ms",
    default_value: 5000,
    type: "number (milliseconds)",
    description: "Debounce delay for auto-reindex after writes. Multiple writes within this window are batched into one reindex",
    system: "Search (all backends)",
    code_ref: "src/core/search.ts → scheduleDebouncedReindex()",
  },
];

/**
 * Format CONFIG_REFERENCE as a readable markdown table.
 */
export function formatConfigReference(filter?: string): string {
  let params = CONFIG_REFERENCE;
  if (filter) {
    const f = filter.toLowerCase();
    params = params.filter(
      (p) =>
        p.path.toLowerCase().includes(f) ||
        p.system.toLowerCase().includes(f) ||
        p.description.toLowerCase().includes(f)
    );
  }

  if (params.length === 0) return "No matching parameters found.";

  const lines: string[] = [
    "# Open Palace Configuration Reference",
    "",
    `${params.length} parameter(s)${filter ? ` matching "${filter}"` : ""}`,
    "",
  ];

  let currentSystem = "";
  for (const p of params) {
    const sysShort = p.system.split("(")[0].trim();
    if (sysShort !== currentSystem) {
      currentSystem = sysShort;
      lines.push(`## ${p.system.split("(")[0].trim()}`);
      lines.push("");
    }
    const defStr =
      p.default_value === null
        ? "null"
        : Array.isArray(p.default_value)
          ? `[${(p.default_value as string[]).join(", ")}]`
          : typeof p.default_value === "object"
            ? JSON.stringify(p.default_value)
            : String(p.default_value);
    lines.push(`**\`${p.path}\`**`);
    lines.push(`- Type: \`${p.type}\``);
    lines.push(`- Default: \`${defStr}\``);
    lines.push(`- ${p.description}`);
    lines.push(`- System: ${p.system}`);
    lines.push(`- Code: \`${p.code_ref}\``);
    lines.push("");
  }

  return lines.join("\n");
}

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
