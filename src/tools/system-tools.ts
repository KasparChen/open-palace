/**
 * MCP tool definitions for System Store.
 * Tools: mp_system_list, mp_system_execute, mp_system_status, mp_system_configure
 *
 * Phase 3: Connected to real System Store with executable Librarian + Health Check.
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  listSystems,
  executeSystem,
  getSystemState,
} from "../core/system.js";
import { updateConfig, getConfigValue } from "../core/config.js";

export function registerSystemTools(server: McpServer): void {
  server.tool(
    "mp_system_list",
    "List all registered systems and their current status",
    {},
    async () => {
      const systems = listSystems();
      const text = systems
        .map((s) => {
          const lastRun = s.state.last_run
            ? new Date(s.state.last_run).toISOString().slice(0, 16)
            : "never";
          const status = s.state.last_result ?? "idle";
          return `[${status}] ${s.name} | trigger:${s.default_trigger} | runs:${s.state.run_count} | last:${lastRun}\n  ${s.description}`;
        })
        .join("\n\n");
      return {
        content: [{ type: "text", text: text || "(No systems registered)" }],
      };
    }
  );

  server.tool(
    "mp_system_execute",
    "Execute a system by name. For librarian: pass level (digest/synthesis/review) and optional scope. For health_check: no params needed.",
    {
      name: z
        .string()
        .describe(
          "System name: librarian, retrieval_digest, health_check"
        ),
      params: z
        .record(z.unknown())
        .optional()
        .describe(
          'System-specific parameters. Librarian: {level: "digest"|"synthesis"|"review", scope?: "projects/xxx"}'
        ),
    },
    async ({ name, params }) => {
      const result = await executeSystem(name, params);
      const text = [
        `**${name}** — ${result.success ? "✅ Success" : "❌ Failed"}`,
        `Message: ${result.message}`,
        `Duration: ${result.duration_ms}ms`,
      ];

      if (result.details) {
        text.push(`Details: ${JSON.stringify(result.details, null, 2)}`);
      }

      return {
        content: [{ type: "text", text: text.join("\n") }],
        isError: !result.success,
      };
    }
  );

  server.tool(
    "mp_system_status",
    "Check the status of a specific system or all systems",
    {
      name: z
        .string()
        .optional()
        .describe("System name (omit for all)"),
    },
    async ({ name }) => {
      if (name) {
        const state = getSystemState(name);
        if (!state) {
          return {
            content: [
              { type: "text", text: `System not found: ${name}` },
            ],
            isError: true,
          };
        }
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ name, ...state }, null, 2),
            },
          ],
        };
      }

      const systems = listSystems();
      const text = JSON.stringify(
        systems.map((s) => ({ name: s.name, ...s.state })),
        null,
        2
      );
      return { content: [{ type: "text", text }] };
    }
  );

  server.tool(
    "mp_system_configure",
    "Update system configuration (e.g., librarian schedule, LLM model). Uses dot-path notation.",
    {
      path: z
        .string()
        .describe(
          'Config dot-path, e.g. "librarian.schedules.digest.interval" or "librarian.llm.model"'
        ),
      value: z
        .union([z.string(), z.number(), z.boolean()])
        .describe("New value"),
    },
    async ({ path, value }) => {
      await updateConfig(path, value);
      const updated = await getConfigValue(path);
      return {
        content: [
          {
            type: "text",
            text: `Config updated: ${path} = ${JSON.stringify(updated)}`,
          },
        ],
      };
    }
  );
}
