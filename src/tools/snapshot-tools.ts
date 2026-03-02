/**
 * MCP tool definitions for Context Snapshot.
 * Tools: mp_snapshot_save, mp_snapshot_read
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { saveSnapshot, readSnapshot } from "../core/snapshot.js";

const SnapshotTaskSchema = z.object({
  description: z.string(),
  status: z.enum(["active", "blocked", "waiting"]),
  priority: z.enum(["high", "medium", "low"]).optional(),
  blockers: z.array(z.string()).optional(),
});

export function registerSnapshotTools(server: McpServer): void {
  server.tool(
    "mp_snapshot_save",
    "Save a real-time context snapshot (overwrites previous). Use before compaction or at key milestones to preserve working state for instant recovery.",
    {
      current_focus: z
        .string()
        .describe("What you are currently working on (one sentence)"),
      active_tasks: z
        .array(SnapshotTaskSchema)
        .optional()
        .describe("Current active tasks"),
      blockers: z
        .array(z.string())
        .optional()
        .describe("Current blockers"),
      recent_decisions: z
        .array(z.string())
        .optional()
        .describe("Recent important decisions (max 5 summaries)"),
      context_notes: z
        .string()
        .optional()
        .describe("Free-text context notes you consider important"),
      session_meta: z
        .object({
          compaction_count: z.number().optional(),
          started_at: z.string().optional(),
        })
        .optional()
        .describe("Session metadata"),
      updated_by: z
        .string()
        .optional()
        .describe("Agent ID"),
    },
    async (args) => {
      const snapshot = await saveSnapshot(args);
      return {
        content: [
          {
            type: "text",
            text: `Snapshot saved at ${snapshot.updated_at}\nFocus: ${snapshot.current_focus}\nTasks: ${snapshot.active_tasks.length} | Blockers: ${snapshot.blockers.length} | Decisions: ${snapshot.recent_decisions.length}`,
          },
        ],
      };
    }
  );

  server.tool(
    "mp_snapshot_read",
    "Read the current context snapshot. Use at session start or after compaction to instantly restore working state.",
    {},
    async () => {
      const snapshot = await readSnapshot();
      if (!snapshot) {
        return {
          content: [
            {
              type: "text",
              text: "No snapshot found. Use mp_snapshot_save to create one when you want to preserve your working state for recovery.",
            },
          ],
        };
      }

      const lines = [
        `**Updated**: ${snapshot.updated_at}${snapshot.updated_by ? ` by ${snapshot.updated_by}` : ""}`,
        `**Focus**: ${snapshot.current_focus}`,
      ];

      if (snapshot.active_tasks.length > 0) {
        lines.push(
          `**Active Tasks**:\n${snapshot.active_tasks
            .map(
              (t) =>
                `  - [${t.status}${t.priority ? `/${t.priority}` : ""}] ${t.description}${t.blockers?.length ? ` (blocked by: ${t.blockers.join(", ")})` : ""}`
            )
            .join("\n")}`
        );
      }

      if (snapshot.blockers.length > 0) {
        lines.push(`**Blockers**: ${snapshot.blockers.join("; ")}`);
      }

      if (snapshot.recent_decisions.length > 0) {
        lines.push(
          `**Recent Decisions**:\n${snapshot.recent_decisions.map((d) => `  - ${d}`).join("\n")}`
        );
      }

      if (snapshot.context_notes) {
        lines.push(`**Context Notes**: ${snapshot.context_notes}`);
      }

      if (snapshot.session_meta) {
        const meta = snapshot.session_meta;
        const metaParts: string[] = [];
        if (meta.started_at) metaParts.push(`started: ${meta.started_at}`);
        if (meta.compaction_count != null)
          metaParts.push(`compactions: ${meta.compaction_count}`);
        if (metaParts.length > 0)
          lines.push(`**Session**: ${metaParts.join(" | ")}`);
      }

      return {
        content: [{ type: "text", text: lines.join("\n") }],
      };
    }
  );
}
