/**
 * MCP tool definitions for Relationship Memory.
 * Tools: mp_relationship_get, mp_relationship_update_profile,
 *        mp_relationship_log_interaction, mp_relationship_update_trust
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  getRelationship,
  updateProfile,
  logInteraction,
  updateTrust,
} from "../core/relationship.js";
import { loadComponent } from "../core/component.js";

export function registerRelationshipTools(server: McpServer): void {
  server.tool(
    "mp_relationship_get",
    "Get the full relationship record for an entity (profile, interaction tags, trust score and history, recent changelog).",
    {
      entity_id: z.string().describe("Entity ID (e.g., 'user_yc', 'agent_cmo')"),
    },
    async ({ entity_id }) => {
      const profile = await getRelationship(entity_id);
      if (!profile) {
        return {
          content: [
            {
              type: "text",
              text: `No relationship record found for "${entity_id}". Use mp_relationship_update_profile to create one.`,
            },
          ],
        };
      }

      const loaded = await loadComponent(`relationships/${entity_id}`);
      const recentChangelog = loaded?.recent_changelog ?? [];

      const lines = [
        `**${profile.entity_id}** (${profile.type})`,
        `Trust: ${profile.trust_score.toFixed(2)}`,
      ];

      if (profile.profile.style) lines.push(`Style: ${profile.profile.style}`);
      if (profile.profile.expertise?.length)
        lines.push(`Expertise: ${profile.profile.expertise.join(", ")}`);
      if (profile.profile.language_pref?.length)
        lines.push(`Language: ${profile.profile.language_pref.join(", ")}`);
      if (profile.profile.notes) lines.push(`Notes: ${profile.profile.notes}`);

      if (profile.interaction_tags.length > 0) {
        lines.push(
          `\n**Interaction Tags**:\n${profile.interaction_tags
            .sort((a, b) => b.count - a.count)
            .map((t) => `  - ${t.tag}: ${t.count}x (last: ${t.last})${t.note ? ` — ${t.note}` : ""}`)
            .join("\n")}`
        );
      }

      if (profile.trust_history.length > 0) {
        lines.push(
          `\n**Trust History** (last 5):\n${profile.trust_history
            .slice(-5)
            .map((h) => `  - ${h.date}: ${h.delta >= 0 ? "+" : ""}${h.delta} — ${h.reason}`)
            .join("\n")}`
        );
      }

      if (recentChangelog.length > 0) {
        lines.push(
          `\n**Recent Activity** (${recentChangelog.length}):\n${recentChangelog
            .slice(0, 5)
            .map((e) => `  - [${e.time.slice(0, 10)}] ${e.summary}`)
            .join("\n")}`
        );
      }

      return {
        content: [{ type: "text", text: lines.join("\n") }],
      };
    }
  );

  server.tool(
    "mp_relationship_update_profile",
    "Update a relationship profile (creates one if it doesn't exist). Partial updates merge with existing data.",
    {
      entity_id: z.string().describe("Entity ID"),
      type: z.enum(["user", "agent", "external"]).optional().describe("Entity type"),
      style: z.string().optional().describe("Communication style"),
      expertise: z.array(z.string()).optional().describe("Areas of expertise"),
      language_pref: z.array(z.string()).optional().describe("Language preferences"),
      notes: z.string().optional().describe("Free-form notes"),
    },
    async ({ entity_id, type, style, expertise, language_pref, notes }) => {
      const result = await updateProfile(entity_id, {
        type,
        style,
        expertise,
        language_pref,
        notes,
      });
      return {
        content: [
          {
            type: "text",
            text: `Profile updated for ${result.entity_id} (${result.type}). Trust: ${result.trust_score.toFixed(2)}`,
          },
        ],
      };
    }
  );

  server.tool(
    "mp_relationship_log_interaction",
    "Log interaction tags for an entity. Tags are accumulated (count incremented if existing, created if new).",
    {
      entity_id: z.string().describe("Entity ID"),
      tags: z
        .array(z.string())
        .describe(
          'Interaction tags to log (e.g., ["deep_technical_discussion", "praised_output"])'
        ),
    },
    async ({ entity_id, tags }) => {
      const result = await logInteraction(entity_id, tags);
      const updated = result.interaction_tags
        .filter((t) => tags.includes(t.tag))
        .map((t) => `${t.tag}: ${t.count}x`)
        .join(", ");
      return {
        content: [
          {
            type: "text",
            text: `Interaction logged for ${entity_id}: ${updated}`,
          },
        ],
      };
    }
  );

  server.tool(
    "mp_relationship_update_trust",
    "Update the trust score for an entity. Delta is added to current score (clamped to 0.0-1.0).",
    {
      entity_id: z.string().describe("Entity ID"),
      delta: z.number().describe("Trust score change (e.g., +0.05 or -0.1)"),
      reason: z.string().describe("Reason for the trust change"),
    },
    async ({ entity_id, delta, reason }) => {
      const result = await updateTrust(entity_id, delta, reason);
      return {
        content: [
          {
            type: "text",
            text: `Trust updated for ${entity_id}: ${result.trust_score.toFixed(2)} (${delta >= 0 ? "+" : ""}${delta}: ${reason})`,
          },
        ],
      };
    }
  );
}
