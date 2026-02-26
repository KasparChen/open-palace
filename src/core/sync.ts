/**
 * Workspace sync — detects changes in host workspace files (SOUL.md, etc.)
 * and syncs them to Open Palace entities/backups on each MCP server startup.
 *
 * Uses SHA256 diffing against sync-state.yaml to determine what changed.
 * Designed for stdio transport (short-lived process): runs once at init.
 */

import fs from "node:fs/promises";
import crypto from "node:crypto";
import path from "node:path";
import { paths } from "../utils/paths.js";
import { readYaml, writeYaml, writeMarkdown } from "../utils/yaml.js";
import { gitCommit } from "./git.js";
import { isoNow } from "../utils/id.js";
import type {
  WorkspaceSyncState,
  FileSyncState,
  Entity,
  PalaceConfig,
} from "../types.js";

const DEFAULT_WATCHED_FILES = [
  "SOUL.md",
  "IDENTITY.md",
  "USER.md",
  "AGENTS.md",
  "TOOLS.md",
];

let workspacePath: string | null = null;

export function getWorkspacePath(): string | null {
  return workspacePath;
}

function syncStatePath(): string {
  return path.join(paths.syncDir(), "sync-state.yaml");
}

function backupDir(): string {
  return path.join(paths.syncDir(), "workspace-backup");
}

async function sha256(content: string): Promise<string> {
  return crypto.createHash("sha256").update(content, "utf-8").digest("hex");
}

async function readSyncState(): Promise<WorkspaceSyncState> {
  const state = await readYaml<WorkspaceSyncState>(syncStatePath());
  return state ?? { files: {} };
}

async function writeSyncState(state: WorkspaceSyncState): Promise<void> {
  await writeYaml(syncStatePath(), state);
}

/**
 * Detect the OpenClaw workspace path by probing known locations.
 * Returns null if no workspace is found.
 */
async function detectWorkspacePath(
  config: PalaceConfig
): Promise<string | null> {
  if (config.workspace_sync?.workspace_path) {
    try {
      await fs.access(config.workspace_sync.workspace_path);
      return config.workspace_sync.workspace_path;
    } catch {
      /* configured path not accessible */
    }
  }

  const candidates = [
    path.join(process.env.HOME ?? "~", ".openclaw", "workspace"),
    "/home/node/.openclaw/workspace",
  ];

  for (const candidate of candidates) {
    try {
      await fs.access(path.join(candidate, "SOUL.md"));
      return candidate;
    } catch {
      continue;
    }
  }

  return null;
}

export interface SyncResult {
  synced: boolean;
  changes: Array<{ file: string; action: "created" | "updated" }>;
  entityUpdated: boolean;
}

/**
 * Run workspace sync: compare file hashes, update entity + backups for changes.
 * Called once at MCP server startup.
 */
export async function syncWorkspace(
  config: PalaceConfig
): Promise<SyncResult> {
  const wsPath = await detectWorkspacePath(config);
  if (!wsPath) {
    return { synced: false, changes: [], entityUpdated: false };
  }
  workspacePath = wsPath;

  const watchedFiles =
    config.workspace_sync?.watched_files ?? DEFAULT_WATCHED_FILES;
  const entityMapping = config.workspace_sync?.entity_mapping ?? {
    main: "main",
  };

  const state = await readSyncState();
  const changes: SyncResult["changes"] = [];
  let entityUpdated = false;

  await fs.mkdir(backupDir(), { recursive: true });

  for (const fileName of watchedFiles) {
    const filePath = path.join(wsPath, fileName);
    let content: string;
    try {
      content = await fs.readFile(filePath, "utf-8");
    } catch {
      continue;
    }

    const hash = await sha256(content);
    const prev = state.files[fileName];

    if (prev && prev.sha256 === hash) {
      continue;
    }

    const action = prev ? "updated" : "created";
    changes.push({ file: fileName, action });

    await writeMarkdown(path.join(backupDir(), fileName), content);

    if (fileName === "SOUL.md") {
      const entityId = entityMapping["main"] ?? "main";
      entityUpdated = await syncSoulToEntity(entityId, content, action);
    }

    state.files[fileName] = {
      sha256: hash,
      last_synced: isoNow(),
      file_path: filePath,
    };
  }

  if (changes.length > 0) {
    state.last_full_sync = isoNow();
    await writeSyncState(state);

    const fileList = changes.map((c) => `${c.file}(${c.action})`).join(", ");
    await gitCommit(`sync: workspace files ${fileList}`);
  }

  return { synced: true, changes, entityUpdated };
}

/**
 * Sync SOUL.md content to the main entity. Creates entity if missing.
 */
async function syncSoulToEntity(
  entityId: string,
  soulContent: string,
  action: "created" | "updated"
): Promise<boolean> {
  const entityPath = paths.entity(entityId);
  let entity: Entity | null = null;

  try {
    entity = await readYaml<Entity>(entityPath);
  } catch {
    /* entity doesn't exist yet */
  }

  if (!entity) {
    entity = {
      entity_id: entityId,
      display_name: entityId === "main" ? "Main Agent" : entityId,
      description:
        entityId === "main"
          ? "Primary orchestrator (synced from OpenClaw workspace)"
          : `Agent ${entityId}`,
      soul_content: soulContent,
      evolution_log: [
        {
          time: isoNow(),
          source: "sync:workspace/SOUL.md",
          change_summary: "Initial sync from OpenClaw workspace",
        },
      ],
      host_mappings: {},
    };
  } else {
    if (entity.soul_content === soulContent) {
      return false;
    }
    entity.soul_content = soulContent;
    entity.evolution_log.push({
      time: isoNow(),
      source: "sync:workspace/SOUL.md",
      change_summary: `SOUL.md ${action} in workspace — auto-synced`,
    });
  }

  await writeYaml(entityPath, entity);
  return true;
}

/**
 * Write SOUL content back to the OpenClaw workspace SOUL.md file.
 * Used by mp_entity_update_soul for bidirectional sync.
 */
export async function writeSoulToWorkspace(
  entityId: string,
  content: string
): Promise<boolean> {
  if (!workspacePath) return false;

  const entityMapping: Record<string, string> = { main: "main" };
  const mainEntityId = entityMapping["main"] ?? "main";
  if (entityId !== mainEntityId) return false;

  const soulPath = path.join(workspacePath, "SOUL.md");
  try {
    await fs.writeFile(soulPath, content, "utf-8");

    const state = await readSyncState();
    state.files["SOUL.md"] = {
      sha256: await sha256(content),
      last_synced: isoNow(),
      file_path: soulPath,
    };
    await writeSyncState(state);

    return true;
  } catch (err) {
    console.error("[sync] Failed to write SOUL.md to workspace:", err);
    return false;
  }
}
