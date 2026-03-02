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

export function registerScratchTools(server: McpServer): void {
  server.tool(
    "mp_scratch_write",
    "Capture an insight, observation, or learning instantly. Zero friction — just content and optional tags. Use this the moment you notice something important during debugging, exploration, or any work. Don't wait until session end.",
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
    "Read recent scratch entries (today + optionally yesterday). Use at session start to recall working context from previous sessions. Excludes already-promoted entries by default.",
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

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                stats,
                entries,
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
