/**
 * MCP tool definitions for L2 Search.
 * Tools: mp_raw_search, mp_search_reindex, mp_search_status
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { searchData, reindexSearch, getSearchStatus } from "../core/search.js";

export function registerSearchTools(server: McpServer): void {
  server.tool(
    "mp_raw_search",
    "Search Open Palace data (changelogs, summaries, scratch) using the best available backend (QMD > Orama > builtin scan). Returns raw matching snippets with relevance scores.",
    {
      query: z.string().describe("Search query (natural language or keywords)"),
      scope: z
        .string()
        .optional()
        .describe("Limit search to a component scope (e.g., 'projects/my-app')"),
      limit: z.number().optional().describe("Max results to return (default: 20)"),
    },
    async ({ query, scope, limit }) => {
      const results = await searchData(query, scope, limit);
      const status = getSearchStatus();

      if (results.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: `No results for "${query}"${scope ? ` in ${scope}` : ""} (backend: ${status.backend ?? "none"})`,
            },
          ],
        };
      }

      const lines = [
        `**${results.length} results** for "${query}"${scope ? ` in ${scope}` : ""} (backend: ${status.backend})`,
        "",
      ];

      for (const r of results) {
        lines.push(
          `**[${r.id}]** score:${r.score.toFixed(2)} | ${r.source}${r.component ? ` (${r.component})` : ""}`
        );
        lines.push(`  ${r.content.slice(0, 200)}`);
        lines.push("");
      }

      return {
        content: [{ type: "text", text: lines.join("\n") }],
      };
    }
  );

  server.tool(
    "mp_search_reindex",
    "Manually trigger search index rebuild. Useful after bulk data changes or if search results seem stale.",
    {},
    async () => {
      const result = await reindexSearch();
      return {
        content: [
          {
            type: "text",
            text: `Reindex complete (${result.backend}): ${result.indexed} items indexed in ${result.duration_ms}ms`,
          },
        ],
      };
    }
  );

  server.tool(
    "mp_search_status",
    "Check the current search backend status: which backend is active, how many items are indexed, last reindex time.",
    {},
    async () => {
      const status = getSearchStatus();
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(status, null, 2),
          },
        ],
      };
    }
  );
}
