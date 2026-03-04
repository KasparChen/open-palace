/**
 * MCP tool definitions for Sub-Agent lifecycle support.
 * Tools: mp_spawn_context, mp_session_end
 *
 * mp_spawn_context — one-call context bundle for sub-agent spawning.
 * mp_session_end   — capture learnings when a session/sub-agent completes.
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getSoul, getEntity, logEvolution } from "../core/entity.js";
import { listComponents, getSummary } from "../core/component.js";
import { searchIndex } from "../core/index.js";
import { readScratch, writeScratch } from "../core/scratch.js";

/**
 * Build a full context block for a sub-agent spawn.
 * Includes: entity soul, matched component summaries, recent scratch, completion protocol.
 */
async function buildSpawnContext(
  entityId: string,
  task?: string,
  includeComponents?: string[]
): Promise<string> {
  const soul = await getSoul(entityId);
  if (!soul) {
    return `[Error] Entity not found: ${entityId}. Create it first with mp_entity_create.`;
  }

  let context = "## Your Identity\n\n";
  context += soul;
  context += "\n\n";

  // Resolve components to include
  const componentKeys: string[] = [];

  if (includeComponents?.length) {
    componentKeys.push(...includeComponents);
  } else if (task) {
    // Keyword-match task against L0 index to find relevant components
    const allComponents = await listComponents();
    const keywords = task
      .toLowerCase()
      .split(/[\s,;]+/)
      .filter((w) => w.length > 2);

    for (const key of allComponents) {
      const keyLower = key.toLowerCase();
      if (keywords.some((kw) => keyLower.includes(kw))) {
        componentKeys.push(key);
      }
    }

    // Also check index line matches
    for (const kw of keywords) {
      const matches = await searchIndex(kw);
      for (const line of matches) {
        const comp = allComponents.find((c) =>
          line.toLowerCase().includes(c.split("/").pop()!.toLowerCase())
        );
        if (comp && !componentKeys.includes(comp)) {
          componentKeys.push(comp);
        }
      }
    }
  }

  // Load component summaries (cap at 5 to keep context manageable)
  if (componentKeys.length > 0) {
    context += "## Relevant Project Context\n\n";
    const toLoad = componentKeys.slice(0, 5);
    for (const key of toLoad) {
      const summary = await getSummary(key);
      if (summary) {
        context += `### ${key}\n${summary}\n\n`;
      }
    }
  }

  // Recent scratch entries (limited, optionally filtered by task keywords)
  const recentScratch = await readScratch({
    include_yesterday: true,
    limit: 10,
  });
  if (recentScratch.length > 0) {
    context += "## Recent Working Notes\n\n";
    for (const e of recentScratch) {
      const tags = e.tags?.length ? ` [${e.tags.join(", ")}]` : "";
      context += `- **${e.id}** (${e.time})${tags}: ${e.content}\n`;
    }
    context += "\n";
  }

  // Completion protocol — tells the sub-agent what to do before returning
  context += "## Session Protocol\n\n";
  context +=
    "When you complete your task, BEFORE returning your response:\n";
  context +=
    '1. Call `mp_scratch_write` to capture any insights or learnings from this work\n';
  context +=
    "2. If you made decisions with rationale, call `mp_changelog_record`\n";
  context +=
    "3. If your capabilities or role understanding evolved, call `mp_entity_log_evolution`\n";
  context += `   with entity_id="${entityId}"\n`;

  return context;
}

export function registerAgentTools(server: McpServer): void {
  server.tool(
    "mp_spawn_context",
    "Generate a full context block for spawning a sub-agent with identity, project context, and completion protocol. Main agent injects the returned text into the sub-agent's prompt.",
    {
      entity_id: z
        .string()
        .describe("Entity ID of the sub-agent to spawn (e.g. 'cto', 'researcher')"),
      task: z
        .string()
        .optional()
        .describe(
          "Task description — used to auto-match relevant components from the knowledge base"
        ),
      include_components: z
        .array(z.string())
        .optional()
        .describe(
          'Explicit component keys to load (e.g. ["projects/myapp", "knowledge/arch"])'
        ),
    },
    async ({ entity_id, task, include_components }) => {
      const context = await buildSpawnContext(
        entity_id,
        task,
        include_components
      );
      const isError = context.startsWith("[Error]");
      return {
        content: [{ type: "text", text: context }],
        isError,
      };
    }
  );

  server.tool(
    "mp_session_end",
    "Capture learnings when a session or sub-agent completes. Writes to scratch and optionally logs entity evolution. Call this BEFORE returning your final response.",
    {
      entity_id: z
        .string()
        .optional()
        .describe("Entity ID to log evolution against (omit if no entity)"),
      learnings: z
        .string()
        .describe("What was learned or accomplished in this session"),
      tags: z
        .array(z.string())
        .optional()
        .describe("Tags for categorizing these learnings"),
    },
    async ({ entity_id, learnings, tags }) => {
      const source = entity_id
        ? `session_end:${entity_id}`
        : "session_end";

      // 1. Write learnings to scratch
      const entry = await writeScratch({
        content: learnings,
        tags: tags ?? ["session-learnings"],
        source,
      });

      // 2. If entity specified, also log a concise evolution entry
      let evolutionLogged = false;
      if (entity_id) {
        try {
          const ent = await getEntity(entity_id);
          if (ent) {
            // Truncate to first 200 chars for evolution log
            const summary =
              learnings.length > 200
                ? learnings.slice(0, 200) + "..."
                : learnings;
            await logEvolution(entity_id, summary, source);
            evolutionLogged = true;
          }
        } catch {
          // Entity not found or write failed — scratch still saved
        }
      }

      const parts = [`Scratch saved: ${entry.id}`];
      if (evolutionLogged) {
        parts.push(`Evolution logged for entity: ${entity_id}`);
      }

      return {
        content: [{ type: "text", text: parts.join("\n") }],
      };
    }
  );
}
