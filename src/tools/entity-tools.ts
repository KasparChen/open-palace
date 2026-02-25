/**
 * MCP tool definitions for Entity Registry.
 * Tools: mp.entity.list, mp.entity.get_soul, mp.entity.get_full,
 *        mp.entity.create, mp.entity.update_soul, mp.entity.log_evolution
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as entity from "../core/entity.js";

export function registerEntityTools(server: McpServer): void {
  server.tool(
    "mp_entity_list",
    "List all registered entities (agent identities)",
    {},
    async () => {
      const entities = await entity.listEntities();
      const summary = entities.map((e) => ({
        id: e.entity_id,
        name: e.display_name,
        description: e.description,
        evolution_count: e.evolution_log.length,
      }));
      return { content: [{ type: "text", text: JSON.stringify(summary, null, 2) }] };
    }
  );

  server.tool(
    "mp_entity_get_soul",
    "Get the SOUL/personality definition for an entity (used for sub-agent injection)",
    { entity_id: z.string().describe("The entity identifier") },
    async ({ entity_id }) => {
      const soul = await entity.getSoul(entity_id);
      if (!soul) {
        return { content: [{ type: "text", text: `Entity not found: ${entity_id}` }], isError: true };
      }
      return { content: [{ type: "text", text: soul }] };
    }
  );

  server.tool(
    "mp_entity_get_full",
    "Get full entity data including evolution history and host mappings",
    { entity_id: z.string().describe("The entity identifier") },
    async ({ entity_id }) => {
      const full = await entity.getEntityFull(entity_id);
      if (!full) {
        return { content: [{ type: "text", text: `Entity not found: ${entity_id}` }], isError: true };
      }
      return { content: [{ type: "text", text: JSON.stringify(full, null, 2) }] };
    }
  );

  server.tool(
    "mp_entity_create",
    "Create a new entity with identity information",
    {
      entity_id: z.string().describe("Unique identifier for the entity"),
      display_name: z.string().describe("Display name"),
      description: z.string().describe("Brief description of the entity's role"),
      soul_content: z.string().optional().describe("Initial SOUL/personality content"),
    },
    async ({ entity_id, display_name, description, soul_content }) => {
      const created = await entity.createEntity(entity_id, display_name, description, soul_content ?? "");
      return {
        content: [{ type: "text", text: `Entity created: ${created.entity_id} (${created.display_name})` }],
      };
    }
  );

  server.tool(
    "mp_entity_update_soul",
    "Update an entity's SOUL/personality definition with change tracking",
    {
      entity_id: z.string().describe("The entity identifier"),
      content: z.string().describe("New SOUL content"),
      reason: z.string().describe("Reason for the change"),
    },
    async ({ entity_id, content, reason }) => {
      try {
        const updated = await entity.updateSoul(entity_id, content, reason);
        return {
          content: [{ type: "text", text: `Soul updated for ${entity_id}. Evolution log entries: ${updated.evolution_log.length}` }],
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: String(err) }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "mp_entity_log_evolution",
    "Append an evolution record to an entity's history",
    {
      entity_id: z.string().describe("The entity identifier"),
      change_summary: z.string().describe("Summary of the change"),
      source: z.string().describe("Source of the change (e.g., 'openclaw:SOUL.md', 'manual')"),
    },
    async ({ entity_id, change_summary, source }) => {
      try {
        await entity.logEvolution(entity_id, change_summary, source);
        return { content: [{ type: "text", text: `Evolution logged for ${entity_id}` }] };
      } catch (err) {
        return { content: [{ type: "text", text: String(err) }], isError: true };
      }
    }
  );
}
