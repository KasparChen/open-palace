/**
 * MCP tool definitions for Scratchpad (Working Memory).
 *
 * Tools: mp_scratch_write, mp_scratch_read, mp_scratch_promote
 *
 * Zero-friction capture layer — the agent drops insights here instantly.
 * No scope, no type, no structure required. Just content + optional tags.
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  writeScratch,
  readScratch,
  promoteScratch,
  scratchStats,
} from "../core/scratch.js";
import { getWorkspacePath } from "../core/sync.js";
import fs from "node:fs/promises";
import path from "node:path";

export function registerScratchTools(server: McpServer): void {
  server.tool(
    "mp_scratch_write",
    "Capture an insight NOW — use this INSTEAD of writing to files. Zero friction: just content + optional tags. Call this the moment you discover something important (root cause, failed approach, user correction, non-obvious dependency). NEVER write to memory/*.md or create files to remember things — always use this tool.",
    {
      content: z
        .string()
        .describe(
          "The insight, observation, or note to capture. Be specific — include the why, not just the what."
        ),
      tags: z
        .array(z.string())
        .optional()
        .describe(
          "Optional tags for categorization (e.g. ['debug', 'liteLetter', 'root-cause'])"
        ),
    },
    async ({ content, tags }) => {
      const entry = await writeScratch({ content, tags });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                captured: true,
                id: entry.id,
                time: entry.time,
                message:
                  "Insight captured. It's safe from compaction now. Continue working.",
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  server.tool(
    "mp_scratch_read",
    "Read recent scratch entries (today + optionally yesterday). Note: mp_session_start already includes recent scratch — use this only if you need filtered or standalone scratch access. Excludes already-promoted entries by default.",
    {
      date: z
        .string()
        .optional()
        .describe("Specific date (YYYY-MM-DD). Defaults to today."),
      tags: z
        .array(z.string())
        .optional()
        .describe("Filter by tags"),
      include_yesterday: z
        .boolean()
        .optional()
        .describe("Also include yesterday's entries. Default: true at session start."),
      limit: z
        .number()
        .optional()
        .describe("Max entries to return"),
      include_promoted: z
        .boolean()
        .optional()
        .describe("Include entries already promoted to components. Default: false."),
    },
    async ({ date, tags, include_yesterday, limit, include_promoted }) => {
      const entries = await readScratch({
        date,
        tags,
        include_yesterday: include_yesterday ?? true,
        limit,
        exclude_promoted: !(include_promoted ?? false),
      });

      const stats = await scratchStats();

      let hint: string | undefined;
      if (entries.length === 0) {
        hint = await detectNativeMemoryHint();
      }

      const result: Record<string, unknown> = { stats, entries };
      if (hint) result.hint = hint;

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    }
  );

  /**
   * Check if recent native memory/*.md files exist when scratch is empty,
   * and return a hint nudging the agent to use mp_scratch_write next time.
   */
  async function detectNativeMemoryHint(): Promise<string | undefined> {
    try {
      const wsPath = getWorkspacePath();
      if (!wsPath) return undefined;
      const memDir = path.join(wsPath, "memory");
      const files = await fs.readdir(memDir);
      const mdFiles = files.filter((f) => f.endsWith(".md"));
      if (mdFiles.length === 0) return undefined;

      const now = Date.now();
      const twoDaysMs = 2 * 24 * 60 * 60 * 1000;
      let recentCount = 0;
      for (const f of mdFiles) {
        const stat = await fs.stat(path.join(memDir, f));
        if (now - stat.mtimeMs < twoDaysMs) recentCount++;
      }
      if (recentCount === 0) return undefined;

      return (
        `No recent scratch entries, but ${recentCount} native memory/*.md file(s) ` +
        `were modified in the last 2 days. These are auto-ingested on startup, but ` +
        `for instant searchability and tagging, use mp_scratch_write directly next time.`
      );
    } catch {
      return undefined;
    }
  }

  server.tool(
    "mp_scratch_promote",
    "Promote a scratch entry to a component scope. Marks the entry as promoted and returns guidance to record it formally via mp_changelog_record.",
    {
      scratch_id: z
        .string()
        .describe("ID of the scratch entry (e.g. s_0226_001)"),
      scope: z
        .string()
        .describe(
          "Target component scope (e.g. 'projects/liteLetter', 'knowledge/agent-memory')"
        ),
    },
    async ({ scratch_id, scope }) => {
      const result = await promoteScratch(scratch_id, scope);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          },
        ],
        isError: !result.success,
      };
    }
  );
}
