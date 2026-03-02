/**
 * MCP tool definitions for Memory Decay Engine.
 * Tools: mp_decay_preview, mp_decay_pin
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getDecayPreview, pinEntry, unpinEntry } from "../core/decay.js";

export function registerDecayTools(server: McpServer): void {
  server.tool(
    "mp_decay_preview",
    "Preview which changelog entries would be archived by the decay engine. Dry-run mode — no data is moved.",
    {
      threshold: z
        .number()
        .optional()
        .describe(
          "Override the archive threshold (default from config: 15). Lower = more aggressive archival"
        ),
    },
    async ({ threshold }) => {
      const result = await getDecayPreview(threshold);
      const text = [
        `**Memory Decay Preview** — ${result.success ? "OK" : "Error"}`,
        result.message,
      ];

      if (result.details) {
        const details = result.details as Record<string, unknown>;
        text.push(`\nSafe watermark: ${details.safe_watermark}`);
        text.push(`Threshold: ${details.threshold}`);

        const candidates = details.candidates as Array<Record<string, unknown>>;
        if (candidates?.length > 0) {
          text.push(`\n**Candidates for archival (${candidates.length}):**`);
          for (const c of candidates) {
            text.push(
              `  - [${c.entry_id}] ${c.component} | age: ${c.age_days}d | temp: ${c.temperature} | ${c.summary}`
            );
          }
        }
      }

      return {
        content: [{ type: "text", text: text.join("\n") }],
      };
    }
  );

  server.tool(
    "mp_decay_pin",
    "Pin or unpin a changelog entry to prevent/allow archival by the decay engine. Pinned entries are never archived.",
    {
      entry_id: z.string().describe("The changelog entry ID to pin/unpin"),
      action: z
        .enum(["pin", "unpin"])
        .describe("'pin' to protect from archival, 'unpin' to allow archival"),
    },
    async ({ entry_id, action }) => {
      const result =
        action === "pin"
          ? await pinEntry(entry_id)
          : await unpinEntry(entry_id);

      return {
        content: [
          {
            type: "text",
            text: `${result.success ? "✅" : "❌"} ${result.message}`,
          },
        ],
        isError: !result.success,
      };
    }
  );
}
