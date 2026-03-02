/**
 * Orama Search Backend — Tier 2 (good quality, embedded).
 *
 * Pure TypeScript BM25 full-text search via @orama/orama.
 * Zero external processes; works on all platforms.
 * Index is built lazily on first search and updated incrementally.
 */

import fs from "node:fs/promises";
import { paths } from "../utils/paths.js";
import { readYaml, readMarkdown } from "../utils/yaml.js";
import type { SearchBackend } from "./search.js";
import type { SearchResult, ChangelogEntry, ScratchEntry, ComponentType } from "../types.js";

/* eslint-disable @typescript-eslint/no-explicit-any */
let oramaModule: any = null;
let db: any = null;
let isAvailable: boolean | null = null;

async function loadOrama(): Promise<any> {
  if (oramaModule !== null) return oramaModule;
  try {
    oramaModule = await import("@orama/orama");
    return oramaModule;
  } catch {
    isAvailable = false;
    return null;
  }
}

async function buildIndex(): Promise<{ count: number }> {
  const orama = await loadOrama();
  if (!orama) return { count: 0 };

  db = orama.create({
    schema: {
      entryId: "string",
      content: "string",
      source: "string",
      component: "string",
      entryType: "string",
      time: "string",
    },
  });

  let count = 0;

  const types: ComponentType[] = ["projects", "knowledge", "skills", "relationships"];
  for (const type of types) {
    const dir = `${paths.componentsDir()}/${type}`;
    let entries: string[];
    try {
      entries = await fs.readdir(dir);
    } catch {
      continue;
    }

    for (const key of entries) {
      try {
        const stat = await fs.stat(`${dir}/${key}`);
        if (!stat.isDirectory()) continue;
      } catch {
        continue;
      }

      const changelog = await readYaml<ChangelogEntry[]>(
        paths.componentChangelog(type, key)
      );
      if (changelog) {
        for (const entry of changelog) {
          const text = [entry.summary, entry.decision, entry.rationale, entry.details]
            .filter(Boolean)
            .join(" ");
          orama.insert(db, {
            entryId: entry.id,
            content: text,
            source: `${type}/${key}/changelog`,
            component: `${type}/${key}`,
            entryType: entry.type,
            time: entry.time,
          });
          count++;
        }
      }

      const summary = await readMarkdown(paths.componentSummary(type, key));
      if (summary) {
        orama.insert(db, {
          entryId: `summary:${type}/${key}`,
          content: summary.slice(0, 5000),
          source: `${type}/${key}/summary`,
          component: `${type}/${key}`,
          entryType: "summary",
          time: "",
        });
        count++;
      }
    }
  }

  for (const dateOffset of [0, 1]) {
    const d = new Date();
    d.setDate(d.getDate() - dateOffset);
    const dateStr = d.toISOString().slice(0, 10);
    const scratchEntries = await readYaml<ScratchEntry[]>(paths.scratchFile(dateStr));
    if (scratchEntries) {
      for (const entry of scratchEntries) {
        orama.insert(db, {
          entryId: entry.id,
          content: entry.content,
          source: `scratch/${dateStr}`,
          component: entry.promoted_to ?? "",
          entryType: "scratch",
          time: entry.time,
        });
        count++;
      }
    }
  }

  return { count };
}

export function createOramaBackend(): SearchBackend {
  return {
    name: "orama",

    async available(): Promise<boolean> {
      if (isAvailable !== null) return isAvailable;
      const mod = await loadOrama();
      isAvailable = mod !== null;
      return isAvailable;
    },

    async search(
      query: string,
      scope?: string,
      limit?: number
    ): Promise<SearchResult[]> {
      if (!db) {
        await buildIndex();
        if (!db) return [];
      }

      const orama = await loadOrama();
      if (!orama) return [];

      const searchParams: any = {
        term: query,
        limit: limit ?? 20,
      };
      if (scope) {
        searchParams.where = { component: { eq: scope } };
      }

      const raw = await orama.search(db, searchParams);

      return (raw.hits as any[]).map((hit: any) => ({
        id: String(hit.document?.entryId ?? hit.id),
        content: String(hit.document?.content ?? ""),
        source: String(hit.document?.source ?? ""),
        score: hit.score ?? 0,
        component: String(hit.document?.component ?? "") || undefined,
      }));
    },

    async reindex(): Promise<{ indexed: number; duration_ms: number }> {
      const start = Date.now();
      db = null;
      const { count } = await buildIndex();
      return { indexed: count, duration_ms: Date.now() - start };
    },
  };
}
