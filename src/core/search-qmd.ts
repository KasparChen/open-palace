/**
 * QMD Search Backend — Tier 1 (highest quality).
 *
 * Integrates with QMD CLI (tobi/qmd) for hybrid search:
 * BM25 + vector semantic search + LLM reranking.
 * Reuses OpenClaw's QMD infrastructure when available.
 */

import { execSync, exec } from "node:child_process";
import { getDataDir } from "../utils/paths.js";
import { getConfig } from "./config.js";
import type { SearchBackend } from "./search.js";
import type { SearchResult, SearchConfig } from "../types.js";

function getQmdIndex(cfg?: Partial<SearchConfig>): string {
  return cfg?.qmd_index ?? "open-palace";
}

function qmdAvailable(): boolean {
  try {
    execSync("which qmd", { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

function runQmd(args: string): Promise<string> {
  return new Promise((resolve, reject) => {
    exec(`qmd ${args}`, { timeout: 30000, maxBuffer: 1024 * 1024 * 5 }, (err, stdout, stderr) => {
      if (err) {
        reject(new Error(`qmd failed: ${stderr || err.message}`));
        return;
      }
      resolve(stdout);
    });
  });
}

async function ensureCollection(): Promise<void> {
  const config = await getConfig();
  const idx = getQmdIndex(config.search);
  const dataDir = getDataDir();

  try {
    // Check if collection already exists by listing
    const output = await runQmd(`--index ${idx} collection list`);
    if (output.includes("palace")) return;
  } catch {
    // Collection list may fail if index doesn't exist yet
  }

  try {
    await runQmd(
      `--index ${idx} collection add "${dataDir}" --name palace --mask "**/*.yaml,**/*.md"`
    );
  } catch {
    // May fail if collection already exists — that's fine
  }
}

export function createQmdBackend(): SearchBackend {
  return {
    name: "qmd",

    async available(): Promise<boolean> {
      return qmdAvailable();
    },

    async search(
      query: string,
      scope?: string,
      limit?: number
    ): Promise<SearchResult[]> {
      const config = await getConfig();
      const idx = getQmdIndex(config.search);
      const maxResults = limit ?? 20;

      await ensureCollection();

      const safeQuery = query.replace(/"/g, '\\"');
      let cmd = `--index ${idx} search "${safeQuery}" --json -c palace`;
      if (maxResults) cmd += ` --limit ${maxResults}`;

      const output = await runQmd(cmd);
      const parsed = JSON.parse(output);
      const results: SearchResult[] = [];

      const items = Array.isArray(parsed) ? parsed : parsed.results ?? [];
      for (const item of items) {
        const content = item.content ?? item.text ?? item.snippet ?? "";
        const filePath = item.file ?? item.path ?? item.source ?? "";
        const score = item.score ?? item.rank ?? 0;

        // Derive component scope from file path
        const compMatch = filePath.match(/components\/(\w+)\/([^/]+)/);
        const component = compMatch ? `${compMatch[1]}/${compMatch[2]}` : undefined;

        if (scope && component && !component.startsWith(scope)) continue;

        results.push({
          id: item.id ?? `qmd_${results.length}`,
          content: typeof content === "string" ? content.slice(0, 500) : String(content),
          source: filePath,
          score: typeof score === "number" ? score : 0,
          component,
        });
      }

      return results.slice(0, maxResults);
    },

    async reindex(): Promise<{ indexed: number; duration_ms: number }> {
      const start = Date.now();
      const config = await getConfig();
      const idx = getQmdIndex(config.search);

      await ensureCollection();

      const output = await runQmd(`--index ${idx} update`);
      const countMatch = output.match(/(\d+)\s+(?:files?|documents?)/i);
      const indexed = countMatch ? parseInt(countMatch[1], 10) : 0;

      return { indexed, duration_ms: Date.now() - start };
    },
  };
}
