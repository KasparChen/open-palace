/**
 * MCP tool definitions for the dual-layer changelog system.
 * Tools: mp.changelog.record, mp.changelog.query
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as cl from "../core/changelog.js";

export function registerChangelogTools(server: McpServer): void {
  server.tool(
    "mp_changelog_record",
    "Record a changelog entry (operation or decision) with automatic dual-write",
    {
      scope: z.string().describe("Component path (e.g., 'projects/alpha')"),
      type: z.enum(["operation", "decision"]).describe("Entry type"),
      agent: z.string().optional().describe("Agent identifier"),
      action: z.string().optional().describe("Operation type (for operation entries)"),
      target: z.string().optional().describe("Target file/resource (for operation entries)"),
      decision: z.string().optional().describe("Decision made (for decision entries)"),
      rationale: z.string().optional().describe("Reasoning behind the decision"),
      alternatives: z
        .array(
          z.object({
            option: z.string(),
            rejected_because: z.string(),
          })
        )
        .optional()
        .describe("Rejected alternatives (for decision entries)"),
      summary: z.string().describe("Brief description of the change"),
      details: z.string().optional().describe("Additional details"),
    },
    async (input) => {
      const entry = await cl.recordChangelog(input);
      return {
        content: [
          {
            type: "text",
            text: `Recorded: ${entry.id} [${entry.type}] ${entry.summary}`,
          },
        ],
      };
    }
  );

  server.tool(
    "mp_changelog_query",
    "Query changelog entries with filters",
    {
      scope: z.string().optional().describe("Component path filter"),
      type: z.enum(["operation", "decision"]).optional().describe("Entry type filter"),
      agent: z.string().optional().describe("Agent filter"),
      limit: z.number().optional().describe("Max results (default: 20)"),
    },
    async ({ scope, type, agent, limit }) => {
      const entries = await cl.queryChangelog({
        scope,
        type,
        agent,
        limit: limit ?? 20,
      });

      if (entries.length === 0) {
        return { content: [{ type: "text", text: "No changelog entries found." }] };
      }

      const text = entries
        .map((e) => {
          let line = `[${e.id}] ${e.time} | ${e.type} | ${e.summary}`;
          if (e.decision) line += `\n  Decision: ${e.decision}`;
          if (e.rationale) line += `\n  Rationale: ${e.rationale}`;
          if (e.alternatives?.length) {
            line += "\n  Alternatives:";
            for (const alt of e.alternatives) {
              line += `\n    - ${alt.option}: ${alt.rejected_because}`;
            }
          }
          return line;
        })
        .join("\n\n");

      return { content: [{ type: "text", text: text }] };
    }
  );
}
