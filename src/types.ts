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
  metadata?: Record<string, unknown>;
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

export interface OnboardingConfig {
  completed: boolean;
  completed_at?: string;
  workspace_path?: string;
  version?: string;
}

export interface WorkspaceSyncConfig {
  host: string;
  workspace_path: string;
  watched_files: string[];
  entity_mapping: Record<string, string>;
}

export interface DecayConfig {
  enabled: boolean;
  archive_threshold: number;
  max_age_days: number;
  pinned_entries: string[];
  exclude_types: string[];
}

export interface ValidationConfig {
  enabled: boolean;
  auto_validate_decisions: boolean;
  auto_validate_summaries: boolean;
}

export interface PalaceConfig {
  version: string;
  data_dir: string;
  llm?: LLMConfig;
  librarian: LibrarianConfig;
  sync?: Record<string, SyncConfig>;
  workspace_sync?: WorkspaceSyncConfig;
  onboarding?: OnboardingConfig;
  memory_ingest?: MemoryIngestConfig;
  decay?: DecayConfig;
  validation?: ValidationConfig;
  search?: SearchConfig;
}

// ─── Workspace Sync ──────────────────────────────────────

export interface FileSyncState {
  sha256: string;
  last_synced: string;
  file_path: string;
}

export interface WorkspaceSyncState {
  files: Record<string, FileSyncState>;
  last_full_sync?: string;
}

// ─── Scratch ──────────────────────────────────────────────

export interface ScratchEntry {
  id: string;
  time: string;
  content: string;
  tags?: string[];
  source: string; // "agent" | "ingest:memory/YYYY-MM-DD.md" | ...
  promoted_to?: string; // component scope after promotion
}

// ─── Memory Ingest ────────────────────────────────────────

export interface MemoryIngestConfig {
  enabled: boolean;
  /** Glob pattern relative to workspace, default "memory/*.md" */
  pattern: string;
  /** Auto-run on MCP server startup */
  auto_on_startup: boolean;
}

export interface MemoryIngestState {
  files: Record<string, { sha256: string; last_ingested: string }>;
  last_run?: string;
}

// ─── Memory Decay ────────────────────────────────────────

export interface DecayState {
  last_run?: string;
  last_result?: "success" | "error";
  entries_archived: number;
  entries_preserved: number;
  archive_history: ArchiveRecord[];
}

export interface ArchiveRecord {
  time: string;
  entries_moved: number;
  components_affected: string[];
  reason: string;
}

export interface AccessLog {
  [key: string]: {
    last_accessed: string;
    access_count: number;
  };
}

// ─── Write Validation ────────────────────────────────────

export interface ValidationResult {
  passed: boolean;
  risks: ValidationRisk[];
  suggestion?: string;
}

export interface ValidationRisk {
  type: "duplicate" | "contradiction" | "hallucination" | "stale_override";
  severity: "error" | "warning" | "info";
  description: string;
  conflicting_entry_id?: string;
}

// ─── Relationship ────────────────────────────────────────

export interface InteractionTag {
  tag: string;
  count: number;
  last: string;
  note?: string;
}

export interface TrustChange {
  date: string;
  delta: number;
  reason: string;
}

export interface RelationshipProfile {
  entity_id: string;
  type: "user" | "agent" | "external";
  profile: {
    style?: string;
    expertise?: string[];
    language_pref?: string[];
    notes?: string;
  };
  interaction_tags: InteractionTag[];
  trust_score: number;
  trust_history: TrustChange[];
}

// ─── Search ──────────────────────────────────────────────

export interface SearchConfig {
  backend: "auto" | "qmd" | "orama" | "builtin";
  qmd_index: string;
  auto_reindex: boolean;
  reindex_debounce_ms: number;
}

export interface SearchResult {
  id: string;
  content: string;
  source: string;
  score: number;
  component?: string;
}

// ─── Snapshot ─────────────────────────────────────────────

export interface SnapshotTask {
  description: string;
  status: "active" | "blocked" | "waiting";
  priority?: "high" | "medium" | "low";
  blockers?: string[];
}

export interface Snapshot {
  updated_at: string;
  updated_by?: string;
  current_focus: string;
  active_tasks: SnapshotTask[];
  blockers: string[];
  recent_decisions: string[];
  context_notes: string;
  session_meta?: {
    compaction_count?: number;
    started_at?: string;
  };
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
  | "system.configure"
  | "sync.workspace"
  | "onboarding.complete"
  | "scratch.write"
  | "scratch.promote"
  | "snapshot.save"
  | "relationship.update";

export interface HookContext {
  event: HookEvent;
  payload: Record<string, unknown>;
  timestamp: string;
}
