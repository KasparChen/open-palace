/**
 * MCP tool definitions for L0 Master Index.
 * Tools: mp.index.get, mp.index.search
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as idx from "../core/index.js";

export function registerIndexTools(server: McpServer): void {
  server.tool(
    "mp_index_get",
    "Get the L0 Master Index — global awareness directory (< 500 tokens)",
    {},
    async () => {
      const content = await idx.getMasterIndex();
      return { content: [{ type: "text", text: content }] };
    }
  );

  server.tool(
    "mp_index_search",
    "Search the L0 Master Index by keyword",
    {
      query: z.string().describe("Search keyword"),
      scope: z.string().optional().describe("Optional scope filter"),
    },
    async ({ query, scope }) => {
      const results = await idx.searchIndex(query, scope);
      if (results.length === 0) {
        return { content: [{ type: "text", text: "No matches found in L0 index." }] };
      }
      return { content: [{ type: "text", text: results.join("\n") }] };
    }
  );
}
