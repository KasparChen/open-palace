/**
 * Core type definitions for Open Palace MCP Server.
 */

// ─── Entity ───────────────────────────────────────────────

export interface EvolutionEntry {
  time: string;
  source: string;
  change_summary: string;
  git_ref?: string;
}

export interface HostMapping {
  agent_id: string;
  soul_paths: string[];
}

export interface Entity {
  entity_id: string;
  display_name: string;
  description: string;
  soul_content: string;
  evolution_log: EvolutionEntry[];
  host_mappings: Record<string, HostMapping>;
}

// ─── Changelog ────────────────────────────────────────────

export interface ChangelogAlternative {
  option: string;
  rejected_because: string;
}

export interface ChangelogEntry {
  id: string;
  time: string;
  agent?: string;
  type: "operation" | "decision";
  scope: string;
  action?: string;
  target?: string;
  decision?: string;
  rationale?: string;
  alternatives?: ChangelogAlternative[];
  summary: string;
  details?: string;
  git_ref?: string;
}

// ─── Component ────────────────────────────────────────────

export type ComponentType = "projects" | "knowledge" | "skills" | "relationships";

export interface ComponentMeta {
  type: ComponentType;
  key: string;
  summary?: string;
}

// ─── Index ────────────────────────────────────────────────

export interface IndexEntry {
  tag: string; // [P], [K], [S], [C], [R]
  key: string;
  status: string;
  last_updated: string;
  focus?: string;
  blocker?: string;
  extra?: string;
}

// ─── Config ───────────────────────────────────────────────

export interface LibrarianSchedule {
  interval: "hourly" | "daily" | "weekly" | "monthly" | "manual";
  time?: string;
}

export interface LibrarianConfig {
  schedules: {
    digest: LibrarianSchedule;
    synthesis: LibrarianSchedule;
    review: LibrarianSchedule;
  };
  llm?: {
    model?: string;
  };
}

export interface SyncEntityMapping {
  agent_id: string;
  soul_paths: string[];
  watch: boolean;
}

export interface SyncConfig {
  host: string;
  entities: Record<string, SyncEntityMapping>;
}

export interface LLMConfig {
  model?: string;
  anthropic_api_key?: string;
  /** "sampling" = use host LLM via MCP, "direct" = call Anthropic API directly, "auto" = try sampling first */
  mode?: "sampling" | "direct" | "auto";
}

export interface PalaceConfig {
  version: string;
  data_dir: string;
  llm?: LLMConfig;
  librarian: LibrarianConfig;
  sync?: Record<string, SyncConfig>;
}

// ─── PostHook ─────────────────────────────────────────────

export type HookEvent =
  | "entity.update_soul"
  | "entity.create"
  | "changelog.record"
  | "summary.update"
  | "component.create"
  | "component.load"
  | "component.unload"
  | "index.update"
  | "system.execute"
  | "system.configure";

export interface HookContext {
  event: HookEvent;
  payload: Record<string, unknown>;
  timestamp: string;
}
