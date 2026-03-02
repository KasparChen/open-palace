/**
 * Search Router — three-tier search backend with automatic selection.
 *
 * Tier 1: QMD (external CLI, best quality — BM25 + vector + reranking)
 * Tier 2: Orama (embedded BM25, npm dependency, good quality)
 * Tier 3: Simple scan (zero-dependency, keyword matching fallback)
 *
 * Backend selection: config "search.backend" or auto-detect.
 */

import { getConfig } from "./config.js";
import { isoNow } from "../utils/id.js";
import type { SearchResult, SearchConfig } from "../types.js";

export interface SearchBackend {
  name: string;
  available(): Promise<boolean>;
  search(query: string, scope?: string, limit?: number): Promise<SearchResult[]>;
  reindex(): Promise<{ indexed: number; duration_ms: number }>;
}

let activeBackend: SearchBackend | null = null;
let lastReindex: string | undefined;
let indexedCount = 0;

const backends: SearchBackend[] = [];

export function registerSearchBackend(backend: SearchBackend): void {
  backends.push(backend);
}

function getSearchConfig(partial?: Partial<SearchConfig>): SearchConfig {
  return {
    backend: partial?.backend ?? "auto",
    qmd_index: partial?.qmd_index ?? "open-palace",
    auto_reindex: partial?.auto_reindex ?? true,
    reindex_debounce_ms: partial?.reindex_debounce_ms ?? 5000,
  };
}

export async function getActiveBackend(): Promise<SearchBackend | null> {
  if (activeBackend) return activeBackend;

  const config = await getConfig();
  const searchCfg = getSearchConfig(config.search);

  if (searchCfg.backend !== "auto") {
    const specific = backends.find((b) => b.name === searchCfg.backend);
    if (specific && (await specific.available())) {
      activeBackend = specific;
      return activeBackend;
    }
  }

  // Auto-detect: try backends in priority order
  for (const backend of backends) {
    if (await backend.available()) {
      activeBackend = backend;
      return activeBackend;
    }
  }

  return null;
}

export async function searchData(
  query: string,
  scope?: string,
  limit?: number
): Promise<SearchResult[]> {
  const backend = await getActiveBackend();
  if (!backend) return [];
  return backend.search(query, scope, limit ?? 20);
}

export async function reindexSearch(): Promise<{
  backend: string;
  indexed: number;
  duration_ms: number;
}> {
  const backend = await getActiveBackend();
  if (!backend) {
    return { backend: "none", indexed: 0, duration_ms: 0 };
  }
  const result = await backend.reindex();
  lastReindex = isoNow();
  indexedCount = result.indexed;
  return { backend: backend.name, ...result };
}

export function getSearchStatus(): {
  backend: string | null;
  available_backends: string[];
  indexed_count: number;
  last_reindex: string | undefined;
} {
  return {
    backend: activeBackend?.name ?? null,
    available_backends: backends.map((b) => b.name),
    indexed_count: indexedCount,
    last_reindex: lastReindex,
  };
}

/** Reset cached backend (used when config changes). */
export function resetSearchBackend(): void {
  activeBackend = null;
}

// ─── Debounced reindex for PostHook integration ──────────

let reindexTimer: ReturnType<typeof setTimeout> | null = null;

export async function scheduleDebouncedReindex(): Promise<void> {
  try {
    const config = await getConfig();
    const searchCfg = getSearchConfig(config.search);
    if (!searchCfg.auto_reindex) return;

    if (reindexTimer) clearTimeout(reindexTimer);
    reindexTimer = setTimeout(async () => {
      reindexTimer = null;
      try {
        await reindexSearch();
      } catch {
        // Reindex failure is non-fatal
      }
    }, searchCfg.reindex_debounce_ms);
  } catch {
    // Config read failure is non-fatal
  }
}
