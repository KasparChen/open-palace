/**
 * MCP tool definitions for configuration management.
 * Tools: mp_config_get, mp_config_update, mp_config_reference
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as config from "../core/config.js";
import { formatConfigReference } from "../core/config.js";

export function registerConfigTools(server: McpServer): void {
  server.tool(
    "mp_config_get",
    "Read Open Palace configuration (optionally by dot-path)",
    {
      path: z.string().optional().describe("Dot-path to config value (e.g., 'librarian.schedules.digest')"),
    },
    async ({ path: dotPath }) => {
      const value = await config.getConfigValue(dotPath);
      return {
        content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
      };
    }
  );

  server.tool(
    "mp_config_update",
    "Update a configuration value by dot-path. Use mp_config_reference to see all available parameters.",
    {
      path: z.string().describe("Dot-path to config value"),
      value: z.string().describe("New value (JSON-encoded for complex values)"),
    },
    async ({ path: dotPath, value }) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(value);
      } catch {
        parsed = value;
      }
      await config.updateConfig(dotPath, parsed);
      return {
        content: [{ type: "text", text: `Config updated: ${dotPath}` }],
      };
    }
  );

  server.tool(
    "mp_config_reference",
    "Show the complete configuration parameter reference — all configurable values with defaults, descriptions, affected systems, and code locations. Filter by keyword to narrow results.",
    {
      filter: z
        .string()
        .optional()
        .describe(
          "Optional keyword to filter parameters (matches path, system, or description). E.g. 'decay', 'librarian', 'validation'"
        ),
    },
    async ({ filter }) => {
      const text = formatConfigReference(filter);
      return {
        content: [{ type: "text", text }],
      };
    }
  );
}
