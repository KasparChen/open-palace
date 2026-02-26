/**
 * MCP tool definitions for Onboarding.
 * Tools: mp_onboarding_status, mp_onboarding_init
 *
 * These tools guide the host agent through setting up Open Palace integration:
 * - Layer 1 (auto): create SKILL + append TOOLS.md (non-invasive)
 * - Layer 2 (guided): suggest AGENTS.md modification (needs user confirmation)
 * - Layer 3 (ongoing): workspace file sync runs on every MCP init
 */

import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getConfig, updateConfig } from "../core/config.js";
import { syncWorkspace, getWorkspacePath } from "../core/sync.js";
import { gitCommit } from "../core/git.js";
import { isoNow } from "../utils/id.js";

const SKILL_CONTENT = `---
name: open-palace
description: >-
  Structured memory system for agents. Use at session start to load global
  awareness (projects, entities, decisions). Use when managing projects,
  recording decisions, tracking entity evolution, or recalling cross-session
  information. NOT for: casual daily notes (use native memory/ for those).
metadata:
  openclaw:
    emoji: "\uD83C\uDFDB\uFE0F"
---

# Open Palace — Structured Memory

Open Palace is your structured memory system. It complements OpenClaw's native
memory/ files with indexed, searchable, version-controlled project and decision
tracking.

## Session Startup

At the beginning of every session, run:

\`\`\`
mcporter --config config/mcporter.json call open-palace.mp_index_get
\`\`\`

This returns your L0 Master Index — a compressed global overview of all projects,
entities, and system status (< 500 tokens). Think of it as your "table of contents".

## When to Use Open Palace vs Native Memory

| Situation | Use |
|-----------|-----|
| Daily notes, casual observations | Native \`memory/YYYY-MM-DD.md\` |
| Project tracking, milestones | \`mp_component_create\` / \`mp_component_load\` |
| Technical decisions with rationale | \`mp_changelog_record\` (type: decision) |
| Sub-agent identity/personality | \`mp_entity_get_soul\` / \`mp_entity_create\` |
| Cross-session recall | \`mp_index_search\` → \`mp_component_load\` |
| System health | \`mp_system_execute("health_check")\` |

## Tool Quick Reference

### Index (Global Awareness)
- \`mp_index_get\` — L0 Master Index (all projects/entities at a glance)
- \`mp_index_search query\` — Find matching entries

### Entity (Agent Identity)
- \`mp_entity_list\` — All registered agent identities
- \`mp_entity_get_soul entity_id\` — Get personality definition (for sub-agent spawn)
- \`mp_entity_get_full entity_id\` — Full entity with evolution history
- \`mp_entity_create\` — Register new agent identity
- \`mp_entity_update_soul entity_id content reason\` — Update personality (bidirectional: also updates SOUL.md)
- \`mp_entity_log_evolution\` — Append evolution record

### Component (Projects / Knowledge)
- \`mp_component_list type?\` — List all components
- \`mp_component_create type key summary\` — Create new project/knowledge/skill
- \`mp_component_load key\` — Load into context (returns summary + recent changelog)
- \`mp_component_unload key\` — Remove from active context
- \`mp_summary_get key\` — Get L1 summary
- \`mp_summary_update key content\` — Update summary

### Changelog (Decision Tracking)
- \`mp_changelog_record\` — Record operation or decision (with rationale + alternatives)
- \`mp_changelog_query\` — Query by scope, type, time range

### System (Automated Pipelines)
- \`mp_system_list\` — List registered systems
- \`mp_system_execute name params?\` — Run system (health_check, librarian)
- \`mp_system_status name?\` — Check system run state
- \`mp_system_configure name config\` — Update system settings

### Config
- \`mp_config_get path?\` — Read configuration
- \`mp_config_update path value\` — Update configuration

### Onboarding
- \`mp_onboarding_status\` — Check setup status and get guidance
- \`mp_onboarding_init\` — Run initial setup (syncs workspace, suggests AGENTS.md edit)

## Tool Invocation via mcporter

All tools are called through mcporter:

\`\`\`
mcporter --config config/mcporter.json call open-palace.<tool_name> [key=value ...]
\`\`\`

Examples:
\`\`\`
mcporter --config config/mcporter.json call open-palace.mp_index_get
mcporter --config config/mcporter.json call open-palace.mp_entity_get_soul entity_id=cto
mcporter --config config/mcporter.json call open-palace.mp_changelog_record --args '{"scope":"projects/myapp","type":"decision","decision":"Use Redis","rationale":"Need pub/sub","summary":"Cache layer decision"}'
\`\`\`
`;

const TOOLS_MD_SECTION = `
## Open Palace — Structured Memory

You have an Open Palace MCP server available for structured memory management.

**Connection:** \`mcporter --config config/mcporter.json call open-palace.<tool>\`

**Key tools:**
- \`mp_index_get\` — Global project/entity overview (load at session start)
- \`mp_entity_get_soul <id>\` — Get agent personality for sub-agent spawn
- \`mp_component_load <key>\` — Load project details into context
- \`mp_changelog_record\` — Record decisions with rationale + alternatives
- \`mp_system_execute health_check\` — Check memory system health

**See the \`open-palace\` skill for full tool reference.**
`;

const AGENTS_MD_SECTION = `
## Structured Memory (Open Palace)

You have access to Open Palace — a structured memory system with 24 tools via mcporter.
After reading SOUL/USER/memory above, also:

5. Run \`mcporter --config config/mcporter.json call open-palace.mp_index_get\` to load your global project/entity awareness

Use \`mp_*\` tools for: project tracking, decision logging, entity management, health checks.
Continue using OpenClaw native \`memory/\` for daily logs and casual notes.

See the \`open-palace\` skill for detailed tool reference.
`;

export function registerOnboardingTools(server: McpServer): void {
  server.tool(
    "mp_onboarding_status",
    "Check Open Palace onboarding status and get setup guidance",
    {},
    async () => {
      const config = await getConfig();
      const wsPath = getWorkspacePath();
      const isComplete = config.onboarding?.completed === true;

      if (isComplete) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  status: "complete",
                  completed_at: config.onboarding?.completed_at,
                  workspace_path: wsPath,
                  message:
                    "Onboarding is complete. Open Palace is fully integrated.",
                },
                null,
                2
              ),
            },
          ],
        };
      }

      const hasSkill = wsPath
        ? await fileExists(
            path.join(wsPath, "skills", "open-palace", "SKILL.md")
          )
        : false;
      const toolsHasSection = wsPath
        ? await fileContains(path.join(wsPath, "TOOLS.md"), "Open Palace")
        : false;
      const agentsHasSection = wsPath
        ? await fileContains(
            path.join(wsPath, "AGENTS.md"),
            "Structured Memory"
          )
        : false;

      const steps: string[] = [];
      if (!hasSkill)
        steps.push(
          "Create open-palace skill in workspace (run mp_onboarding_init)"
        );
      if (!toolsHasSection)
        steps.push("Add Open Palace section to TOOLS.md (run mp_onboarding_init)");
      if (!agentsHasSection)
        steps.push(
          "Add session startup step to AGENTS.md (needs user confirmation)"
        );

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                status: "incomplete",
                workspace_detected: !!wsPath,
                workspace_path: wsPath,
                pending_steps: steps,
                message: wsPath
                  ? `Onboarding not complete. Run mp_onboarding_init to set up, then ask user to confirm AGENTS.md modification.`
                  : "No OpenClaw workspace detected. Open Palace works standalone but workspace integration is not available.",
                agents_md_patch: !agentsHasSection
                  ? AGENTS_MD_SECTION.trim()
                  : null,
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  server.tool(
    "mp_onboarding_init",
    "Initialize Open Palace integration: sync workspace files, create skill, update TOOLS.md. Optionally patches AGENTS.md (set patch_agents=true after user confirms).",
    {
      patch_agents: z
        .boolean()
        .optional()
        .describe(
          "If true, also append the Open Palace section to AGENTS.md. Only set true after user confirms."
        ),
    },
    async ({ patch_agents }) => {
      const config = await getConfig();
      const wsPath = getWorkspacePath();

      if (!wsPath) {
        return {
          content: [
            {
              type: "text",
              text: "No OpenClaw workspace detected. Cannot run onboarding.",
            },
          ],
          isError: true,
        };
      }

      const results: string[] = [];

      // Step 1: Create open-palace SKILL
      const skillDir = path.join(wsPath, "skills", "open-palace");
      const skillPath = path.join(skillDir, "SKILL.md");
      try {
        await fs.mkdir(skillDir, { recursive: true });
        await fs.writeFile(skillPath, SKILL_CONTENT, "utf-8");
        results.push("Created open-palace skill at skills/open-palace/SKILL.md");
      } catch (err) {
        results.push(`Failed to create skill: ${err}`);
      }

      // Step 2: Append to TOOLS.md if not already present
      const toolsPath = path.join(wsPath, "TOOLS.md");
      if (!(await fileContains(toolsPath, "Open Palace"))) {
        try {
          const existing = await safeReadFile(toolsPath);
          await fs.writeFile(
            toolsPath,
            existing + TOOLS_MD_SECTION,
            "utf-8"
          );
          results.push("Appended Open Palace section to TOOLS.md");
        } catch (err) {
          results.push(`Failed to update TOOLS.md: ${err}`);
        }
      } else {
        results.push("TOOLS.md already has Open Palace section (skipped)");
      }

      // Step 3: Optionally patch AGENTS.md
      if (patch_agents) {
        const agentsPath = path.join(wsPath, "AGENTS.md");
        if (!(await fileContains(agentsPath, "Structured Memory"))) {
          try {
            const existing = await safeReadFile(agentsPath);
            await fs.writeFile(
              agentsPath,
              existing + AGENTS_MD_SECTION,
              "utf-8"
            );
            results.push(
              "Appended Structured Memory section to AGENTS.md"
            );
          } catch (err) {
            results.push(`Failed to update AGENTS.md: ${err}`);
          }
        } else {
          results.push(
            "AGENTS.md already has Structured Memory section (skipped)"
          );
        }
      } else {
        results.push(
          "AGENTS.md not modified (set patch_agents=true after user confirms). Suggested patch:\n" +
            AGENTS_MD_SECTION.trim()
        );
      }

      // Step 4: Run full workspace sync
      const syncResult = await syncWorkspace(config);
      if (syncResult.changes.length > 0) {
        results.push(
          `Synced ${syncResult.changes.length} workspace file(s): ${syncResult.changes.map((c) => c.file).join(", ")}`
        );
      } else {
        results.push("Workspace files already in sync");
      }
      if (syncResult.entityUpdated) {
        results.push(
          "Main entity updated with current SOUL.md content"
        );
      }

      // Step 5: Mark onboarding as complete
      await updateConfig("onboarding.completed", true);
      await updateConfig("onboarding.completed_at", isoNow());
      await updateConfig("onboarding.workspace_path", wsPath);

      if (!config.workspace_sync) {
        await updateConfig("workspace_sync.host", "openclaw");
        await updateConfig("workspace_sync.workspace_path", wsPath);
        await updateConfig("workspace_sync.watched_files", [
          "SOUL.md",
          "IDENTITY.md",
          "USER.md",
          "AGENTS.md",
          "TOOLS.md",
        ]);
        await updateConfig("workspace_sync.entity_mapping", { main: "main" });
      }

      await gitCommit("onboarding: initial setup complete");

      return {
        content: [
          {
            type: "text",
            text: `Onboarding complete!\n\n${results.join("\n")}`,
          },
        ],
      };
    }
  );
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function fileContains(
  filePath: string,
  searchString: string
): Promise<boolean> {
  try {
    const content = await fs.readFile(filePath, "utf-8");
    return content.includes(searchString);
  } catch {
    return false;
  }
}

async function safeReadFile(filePath: string): Promise<string> {
  try {
    return await fs.readFile(filePath, "utf-8");
  } catch {
    return "";
  }
}
