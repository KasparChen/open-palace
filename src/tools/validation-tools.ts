/**
 * MCP tool definitions for Write Validation.
 * Tools: mp_validate_write
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { validateWrite } from "../core/validation.js";

export function registerValidationTools(server: McpServer): void {
  server.tool(
    "mp_validate_write",
    "Validate content before writing to changelog or summary. Checks for duplicates, contradictions, hallucinations, and stale overrides. Use when uncertain about a write.",
    {
      scope: z
        .string()
        .describe(
          "Component scope to validate against (e.g., 'projects/my-app')"
        ),
      content: z
        .string()
        .describe("The content you intend to write"),
      type: z
        .enum(["changelog", "summary"])
        .describe("Target type: 'changelog' for new entries, 'summary' for summary updates"),
    },
    async ({ scope, content, type }) => {
      const result = await validateWrite({ scope, content, type });

      const lines: string[] = [
        `**Validation ${result.passed ? "✅ Passed" : "❌ Failed"}**`,
      ];

      if (result.risks.length === 0) {
        lines.push("No risks detected. Safe to write.");
      } else {
        lines.push(`\n**Risks (${result.risks.length}):**`);
        for (const r of result.risks) {
          const icon =
            r.severity === "error"
              ? "🔴"
              : r.severity === "warning"
                ? "🟡"
                : "🔵";
          lines.push(
            `${icon} [${r.type}/${r.severity}] ${r.description}${r.conflicting_entry_id ? ` (conflicts with: ${r.conflicting_entry_id})` : ""}`
          );
        }
      }

      if (result.suggestion) {
        lines.push(`\n**Suggestion**: ${result.suggestion}`);
      }

      return {
        content: [{ type: "text", text: lines.join("\n") }],
        isError: !result.passed,
      };
    }
  );
}
