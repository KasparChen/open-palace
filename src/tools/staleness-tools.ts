/**
 * MCP tool definitions for Staleness Scoring.
 * Tools: mp_summary_verify
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { verifySummary } from "../core/component.js";

export function registerStalenessTools(server: McpServer): void {
  server.tool(
    "mp_summary_verify",
    "Mark a component summary as verified (reviewed and up-to-date). Resets its confidence to 'high' and updates last_verified timestamp.",
    {
      key: z
        .string()
        .describe("Component key (e.g., 'projects/my-app', 'knowledge/research')"),
    },
    async ({ key }) => {
      const result = await verifySummary(key);
      if (!result.success) {
        return {
          content: [{ type: "text", text: `Failed: ${result.message}` }],
          isError: true,
        };
      }
      return {
        content: [
          {
            type: "text",
            text: `Verified: ${key} — confidence reset to "high", last_verified updated to today`,
          },
        ],
      };
    }
  );
}
