/**
 * MCP tool definitions for Component Store.
 * Tools: mp.component.list, mp.component.create, mp.component.load, mp.component.unload
 * Also: mp.summary.get, mp.summary.update
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as comp from "../core/component.js";
import type { ComponentType } from "../types.js";

const componentTypeSchema = z.enum(["projects", "knowledge", "skills", "relationships"]);

export function registerComponentTools(server: McpServer): void {
  server.tool(
    "mp_component_list",
    "List all components, optionally filtered by type",
    {
      type: componentTypeSchema.optional().describe("Filter by component type"),
    },
    async ({ type }) => {
      const list = await comp.listComponents(type as ComponentType | undefined);
      return {
        content: [{ type: "text", text: list.length > 0 ? list.join("\n") : "No components found." }],
      };
    }
  );

  server.tool(
    "mp_component_create",
    "Create a new component (knowledge module) with initial summary",
    {
      type: componentTypeSchema.describe("Component type"),
      key: z.string().describe("Component key/name (e.g., 'alpha' for projects/alpha)"),
      summary: z.string().describe("Initial summary text for L1"),
    },
    async ({ type, key, summary }) => {
      await comp.createComponent(type as ComponentType, key, summary);
      return { content: [{ type: "text", text: `Component created: ${type}/${key}` }] };
    }
  );

  server.tool(
    "mp_component_load",
    "Load a component into context — returns its L1 summary + recent changelog",
    {
      key: z.string().describe("Component path (e.g., 'projects/alpha')"),
    },
    async ({ key }) => {
      const data = await comp.loadComponent(key);
      if (!data) {
        return { content: [{ type: "text", text: `Component not found: ${key}` }], isError: true };
      }
      const output = [
        `## Summary\n\n${data.summary}`,
        `\n## Recent Changelog (${data.recent_changelog.length} entries)\n`,
        ...data.recent_changelog.map(
          (e) => `- [${e.time}] ${e.type}: ${e.summary}`
        ),
      ].join("\n");
      return { content: [{ type: "text", text: output }] };
    }
  );

  server.tool(
    "mp_component_unload",
    "Unload a component from context (L0 index entry preserved)",
    {
      key: z.string().describe("Component path (e.g., 'projects/alpha')"),
    },
    async ({ key }) => {
      const success = await comp.unloadComponent(key);
      return {
        content: [{ type: "text", text: success ? `Unloaded: ${key}` : `Not loaded: ${key}` }],
      };
    }
  );

  // Summary tools
  server.tool(
    "mp_summary_get",
    "Get the L1 summary for a component",
    {
      key: z.string().describe("Component path (e.g., 'projects/alpha')"),
    },
    async ({ key }) => {
      const summary = await comp.getSummary(key);
      if (!summary) {
        return { content: [{ type: "text", text: `No summary found: ${key}` }], isError: true };
      }
      return { content: [{ type: "text", text: summary }] };
    }
  );

  server.tool(
    "mp_summary_update",
    "Update the L1 summary for a component",
    {
      key: z.string().describe("Component path (e.g., 'projects/alpha')"),
      content: z.string().describe("New summary content (Markdown)"),
    },
    async ({ key, content }) => {
      await comp.updateSummary(key, content);
      return { content: [{ type: "text", text: `Summary updated: ${key}` }] };
    }
  );
}
