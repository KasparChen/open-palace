/**
 * Simple Search Backend — Tier 3 (zero-dependency fallback).
 *
 * Scans YAML/MD files for keyword matches. No index, no dependencies.
 * Suitable for small datasets; for large scale, use QMD or Orama.
 */

import fs from "node:fs/promises";
import { paths } from "../utils/paths.js";
import { readYaml, readMarkdown } from "../utils/yaml.js";
import type { SearchBackend } from "./search.js";
import type { SearchResult, ChangelogEntry, ScratchEntry, ComponentType } from "../types.js";

function scoreMatch(content: string, query: string): number {
  const lower = content.toLowerCase();
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return 0;

  let matched = 0;
  for (const term of terms) {
    if (lower.includes(term)) matched++;
  }

  return matched / terms.length;
}

export function createSimpleBackend(): SearchBackend {
  return {
    name: "builtin",

    async available(): Promise<boolean> {
      return true;
    },

    async search(
      query: string,
      scope?: string,
      limit?: number
    ): Promise<SearchResult[]> {
      const maxResults = limit ?? 20;
      const results: SearchResult[] = [];

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
          const compKey = `${type}/${key}`;
          if (scope && !compKey.startsWith(scope)) continue;

          try {
            const stat = await fs.stat(`${dir}/${key}`);
            if (!stat.isDirectory()) continue;
          } catch {
            continue;
          }

          // Search changelog
          const changelog = await readYaml<ChangelogEntry[]>(
            paths.componentChangelog(type, key)
          );
          if (changelog) {
            for (const entry of changelog) {
              const text = [entry.summary, entry.decision, entry.rationale, entry.details]
                .filter(Boolean)
                .join(" ");
              const score = scoreMatch(text, query);
              if (score > 0) {
                results.push({
                  id: entry.id,
                  content: text.slice(0, 500),
                  source: `${compKey}/changelog`,
                  score,
                  component: compKey,
                });
              }
            }
          }

          // Search summary
          const summary = await readMarkdown(paths.componentSummary(type, key));
          if (summary) {
            const score = scoreMatch(summary, query);
            if (score > 0) {
              results.push({
                id: `summary:${compKey}`,
                content: summary.slice(0, 500),
                source: `${compKey}/summary`,
                score,
                component: compKey,
              });
            }
          }
        }
      }

      // Search scratch (today + yesterday)
      for (const dateOffset of [0, 1]) {
        const d = new Date();
        d.setDate(d.getDate() - dateOffset);
        const dateStr = d.toISOString().slice(0, 10);
        const scratchEntries = await readYaml<ScratchEntry[]>(paths.scratchFile(dateStr));
        if (scratchEntries) {
          for (const entry of scratchEntries) {
            const score = scoreMatch(entry.content, query);
            if (score > 0) {
              results.push({
                id: entry.id,
                content: entry.content.slice(0, 500),
                source: `scratch/${dateStr}`,
                score,
                component: entry.promoted_to,
              });
            }
          }
        }
      }

      results.sort((a, b) => b.score - a.score);
      return results.slice(0, maxResults);
    },

    async reindex(): Promise<{ indexed: number; duration_ms: number }> {
      // No persistent index to rebuild
      return { indexed: 0, duration_ms: 0 };
    },
  };
}
