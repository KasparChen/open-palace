/**
 * MCP tool definitions for Session management.
 * Tools: mp_session_start
 *
 * Provides a single-call startup that replaces the 3-tool ritual
 * (mp_index_get + mp_snapshot_read + mp_scratch_read).
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getFullStartupContext } from "../core/session.js";

export function registerSessionTools(server: McpServer): void {
  server.tool(
    "mp_session_start",
    "START HERE — Load your full memory context in one call. Returns L0 Master Index (global awareness), working state snapshot, and recent scratch notes. Call this FIRST at every session before doing any work. Replaces the need to call mp_index_get + mp_snapshot_read + mp_scratch_read separately.",
    {},
    async () => {
      const context = await getFullStartupContext();
      return { content: [{ type: "text", text: context }] };
    }
  );
}
