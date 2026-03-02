/**
 * Memory Ingest System — passive sync of host workspace memory files.
 *
 * Scans the host workspace's memory/ directory (e.g. ~/.openclaw/workspace/memory/*.md)
 * and ingests new/changed files into Open Palace's scratch layer.
 *
 * This is the "safety net": even if the agent writes to native memory instead of
 * Open Palace, the content still gets captured here.
 *
 * Registered as a System alongside librarian and health_check.
 * Runs automatically on MCP startup (lightweight SHA256 diff) + on-demand via
 * mp_system_execute("memory_ingest").
 */

import fs from "node:fs/promises";
import crypto from "node:crypto";
import path from "node:path";
import { paths } from "../utils/paths.js";
import { readYaml, writeYaml } from "../utils/yaml.js";
import { gitCommit } from "./git.js";
import { writeScratch } from "./scratch.js";
import { getWorkspacePath } from "./sync.js";
import { registerSystem } from "./system.js";
import { isoNow } from "../utils/id.js";
import type { MemoryIngestState } from "../types.js";

async function sha256(content: string): Promise<string> {
  return crypto.createHash("sha256").update(content, "utf-8").digest("hex");
}

async function readIngestState(): Promise<MemoryIngestState> {
  const state = await readYaml<MemoryIngestState>(paths.memoryIngestState());
  return state ?? { files: {} };
}

async function writeIngestState(state: MemoryIngestState): Promise<void> {
  await writeYaml(paths.memoryIngestState(), state);
}

/**
 * Find all .md files in the workspace memory/ directory.
 */
async function discoverMemoryFiles(wsPath: string): Promise<string[]> {
  const memDir = path.join(wsPath, "memory");
  try {
    const entries = await fs.readdir(memDir);
    return entries
      .filter((f) => f.endsWith(".md"))
      .map((f) => path.join(memDir, f));
  } catch {
    return [];
  }
}

/**
 * Extract a meaningful date from memory filename (e.g. "2026-02-25.md" → "2026-02-25").
 * Falls back to filename without extension.
 */
function extractDateFromPath(filePath: string): string {
  const base = path.basename(filePath, ".md");
  return base;
}

/**
 * Split a memory file into logical sections/paragraphs for scratch entries.
 * Rather than one giant entry per file, break at markdown headers or double newlines.
 */
function splitIntoChunks(content: string, maxChunkSize = 2000): string[] {
  const sections = content.split(/\n(?=#+\s)|(?:\n\s*\n)/).filter((s) => s.trim());

  const chunks: string[] = [];
  let current = "";

  for (const section of sections) {
    if (current.length + section.length > maxChunkSize && current.length > 0) {
      chunks.push(current.trim());
      current = section;
    } else {
      current += (current ? "\n\n" : "") + section;
    }
  }
  if (current.trim()) {
    chunks.push(current.trim());
  }

  return chunks;
}

export interface IngestResult {
  files_scanned: number;
  files_ingested: number;
  entries_created: number;
  details: Array<{ file: string; action: "new" | "updated" | "unchanged" }>;
}

/**
 * Run memory ingest: scan workspace memory/*.md, diff against state, ingest new content.
 */
export async function runMemoryIngest(): Promise<IngestResult> {
  const wsPath = getWorkspacePath();
  if (!wsPath) {
    return {
      files_scanned: 0,
      files_ingested: 0,
      entries_created: 0,
      details: [],
    };
  }

  const memoryFiles = await discoverMemoryFiles(wsPath);
  const state = await readIngestState();
  const result: IngestResult = {
    files_scanned: memoryFiles.length,
    files_ingested: 0,
    entries_created: 0,
    details: [],
  };

  for (const filePath of memoryFiles) {
    const relativeName = `memory/${path.basename(filePath)}`;
    let content: string;
    try {
      content = await fs.readFile(filePath, "utf-8");
    } catch {
      continue;
    }

    if (!content.trim()) {
      result.details.push({ file: relativeName, action: "unchanged" });
      continue;
    }

    const hash = await sha256(content);
    const prev = state.files[relativeName];

    if (prev && prev.sha256 === hash) {
      result.details.push({ file: relativeName, action: "unchanged" });
      continue;
    }

    const action = prev ? "updated" : "new";
    const fileDate = extractDateFromPath(filePath);
    const chunks = splitIntoChunks(content);

    for (const chunk of chunks) {
      await writeScratch({
        content: chunk,
        tags: ["memory-ingest", fileDate],
        source: `ingest:${relativeName}`,
      });
      result.entries_created++;
    }

    state.files[relativeName] = {
      sha256: hash,
      last_ingested: isoNow(),
    };

    result.files_ingested++;
    result.details.push({ file: relativeName, action });
  }

  if (result.files_ingested > 0) {
    state.last_run = isoNow();
    await writeIngestState(state);
    await gitCommit(
      `ingest: ${result.files_ingested} memory file(s), ${result.entries_created} entries`
    );
  }

  return result;
}

/**
 * Register memory_ingest as a System in the System Store.
 */
export function registerMemoryIngestSystem(): void {
  registerSystem({
    name: "memory_ingest",
    description:
      "Scan host workspace memory/*.md files and ingest new/changed content into Open Palace scratch layer. Runs automatically on startup.",
    default_trigger: "event",
    execute: async () => {
      const startTime = Date.now();
      try {
        const result = await runMemoryIngest();
        return {
          success: true,
          message:
            result.files_ingested > 0
              ? `Ingested ${result.files_ingested} file(s), created ${result.entries_created} scratch entries`
              : `All ${result.files_scanned} memory files unchanged`,
          details: result as unknown as Record<string, unknown>,
          duration_ms: Date.now() - startTime,
        };
      } catch (err) {
        return {
          success: false,
          message: `Ingest failed: ${err instanceof Error ? err.message : String(err)}`,
          duration_ms: Date.now() - startTime,
        };
      }
    },
  });
}
