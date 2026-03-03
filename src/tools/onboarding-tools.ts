/**
 * MCP tool definitions for Onboarding.
 * Tools: mp_onboarding_status, mp_onboarding_init
 *
 * Supports both OpenClaw and Cursor environments:
 * - OpenClaw: writes SKILL to workspace/skills/, patches TOOLS.md + AGENTS.md
 * - Cursor: writes SKILL to ~/.cursor/skills/, rule to ~/.cursor/rules/
 * - Both: writes to both environments simultaneously
 */

import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getConfig, updateConfig } from "../core/config.js";
import { syncWorkspace, getWorkspacePath } from "../core/sync.js";
import { gitCommit } from "../core/git.js";
import { isoNow } from "../utils/id.js";

const CURRENT_VERSION = "0.4.1";

// ---------------------------------------------------------------------------
// Shared SKILL body (used by both OpenClaw and Cursor)
// ---------------------------------------------------------------------------

const SKILL_BODY = `# Open Palace — Your Memory System

Open Palace is your SOLE memory system, delivered as an MCP server.
ALL memory operations go through Open Palace tools. Do NOT write to files
(\`memory/*.md\`, \`MEMORY.md\`, etc.) for memory purposes — use Open Palace tools instead.
Data lives in \`~/.open-palace/\`, a local git-versioned store you own.

Two layers:

1. **Scratch** (working memory) — zero-friction capture via \`mp_scratch_write\`.
   Drop insights the moment they happen. Survives compaction because it's a
   persistent file, not session context.
2. **Components** (structured memory) — projects, decisions, entities. Organized,
   indexed, version-controlled.

## Session Lifecycle

### 1. Startup — Load Awareness

At the beginning of every session:

\`\`\`
mp_index_get           → L0 Master Index (< 500 tokens, global overview)
mp_snapshot_read       → Restore working state (if snapshot exists)
mp_scratch_read        → Recent working notes from previous sessions
\`\`\`

This gives you: what projects/entities exist + what you were working on recently.
This REPLACES reading memory/*.md files for context recovery.

### 2. Working — Capture Patterns

**The single most important behavior: capture insights immediately via Open Palace.**

When you notice something important during any work — debugging, exploring,
discussing — call \`mp_scratch_write\` right then. Not a file write. Not a
"mental note". \`mp_scratch_write\`. Context will be compacted; scratch entries won't.

**Trigger conditions for mp_scratch_write:**

- You discovered a root cause → \`mp_scratch_write\`
- An approach failed and you know why → \`mp_scratch_write\`
- The user corrected your understanding → \`mp_scratch_write\`
- You found a non-obvious dependency → \`mp_scratch_write\`
- You made a judgment call without formal decision → \`mp_scratch_write\`
- The session is getting long (>30min) → \`mp_scratch_write\` a summary
- Daily log or session notes → \`mp_scratch_write\` with tags

**Examples:**

\`\`\`
mp_scratch_write content="Root cause: model validation runs against live catalog,
not schema. That's why tests pass but prod fails." tags=["debug","liteLetter"]

mp_scratch_write content="Approach A (Redis pub/sub) won't work — requires
persistent connection, but our workers are serverless." tags=["liteLetter","architecture"]

mp_scratch_write content="User clarification: they want email-first, web archive
is secondary. Reverses our earlier assumption." tags=["liteLetter","requirements"]
\`\`\`

### 3. Formal Decisions — Use Changelog

When a real decision is made (with rationale and rejected alternatives), record it
formally:

\`\`\`
mp_changelog_record scope="projects/liteLetter" type="decision"
  decision="Use Resend for email delivery"
  rationale="Simple API, good deliverability, free tier sufficient for MVP"
  alternatives=[{option:"SendGrid", rejected_because:"Overkill for our volume"},
                {option:"AWS SES", rejected_because:"Complex setup, poor DX"}]
  summary="Email provider selection"
\`\`\`

### 4. Session End / Long Session

If the session ran long (>1hr or >50k tokens):

1. \`mp_snapshot_save\` with current focus and active tasks
2. \`mp_scratch_write\` a session summary
3. Promote important scratch entries to components: \`mp_scratch_promote\`
4. If relevant, update component summaries: \`mp_summary_update\`

## When to Use What

| Situation | Tool |
|-----------|------|
| Mid-work insight, root cause found | \`mp_scratch_write\` |
| Quick observation during debugging | \`mp_scratch_write\` |
| Daily log, session notes | \`mp_scratch_write\` (with tags) |
| Confirmed project decision (with alternatives) | \`mp_changelog_record\` |
| New project or knowledge domain | \`mp_component_create\` |
| "What projects do I have?" | \`mp_index_get\` |
| "What did we decide about X?" | \`mp_changelog_query\` |
| Sub-agent personality for spawn | \`mp_entity_get_soul\` |
| Search across all data | \`mp_raw_search\` |
| Deep query with synthesis | \`mp_system_execute("retrieval_digest")\` |
| Preserve state before compaction | \`mp_snapshot_save\` |
| System health / maintenance | \`mp_system_execute("health_check")\` |

**Key principle:** If in doubt, use \`mp_scratch_write\`. It's the lowest-friction
way to persist anything. NEVER write to a file to "remember" something.

## Fallback (ONLY when Open Palace is unreachable)

If \`mp_*\` tool calls fail with connection errors or the MCP server is down:
1. Write to \`memory/YYYY-MM-DD.md\` as emergency fallback
2. Prefix the entry with \`[FALLBACK]\` so you know to migrate it later
3. When Open Palace is back, these files are auto-ingested on next startup

## Tool Quick Reference

### Scratch (Working Memory)
- \`mp_scratch_write content tags?\` — Capture insight immediately
- \`mp_scratch_read date? tags? include_yesterday?\` — Read recent entries
- \`mp_scratch_promote scratch_id scope\` — Promote entry to a component

### Snapshot (Compaction Recovery)
- \`mp_snapshot_save current_focus ...\` — Save working state (overwrites previous)
- \`mp_snapshot_read\` — Restore working state after compaction

### Index (Global Awareness)
- \`mp_index_get\` — L0 Master Index (all projects/entities at a glance)
- \`mp_index_search query\` — Find matching entries

### Entity (Agent Identity)
- \`mp_entity_list\` — All registered agent identities
- \`mp_entity_get_soul entity_id\` — Get personality definition
- \`mp_entity_get_full entity_id\` — Full entity with evolution history
- \`mp_entity_create\` — Register new agent identity
- \`mp_entity_update_soul entity_id content reason\` — Update personality

### Component (Projects / Knowledge)
- \`mp_component_list type?\` — List all components
- \`mp_component_create type key summary\` — Create new module
- \`mp_component_load key\` — Load into context (summary + recent changelog)
- \`mp_component_unload key\` — Remove from active context
- \`mp_summary_get key\` / \`mp_summary_update key content\` — Read/write L1 summary
- \`mp_summary_verify key\` — Mark summary as reviewed and up-to-date

### Changelog (Decision Tracking)
- \`mp_changelog_record\` — Record decision (with rationale + rejected alternatives)
- \`mp_changelog_query\` — Query by scope, type, time range
- \`mp_validate_write\` — Pre-write validation (detect duplicates, contradictions)

### Search (L2 RAG)
- \`mp_raw_search query scope? limit?\` — Search all data (auto-selects QMD/Orama/builtin)
- \`mp_search_reindex\` — Manually rebuild search index
- \`mp_search_status\` — Check active search backend and index stats

### Relationship (Interaction Memory)
- \`mp_relationship_get entity_id\` — Get profile + interaction tags + trust
- \`mp_relationship_update_profile entity_id ...\` — Update user/agent profile
- \`mp_relationship_log_interaction entity_id tags[]\` — Log interaction patterns
- \`mp_relationship_update_trust entity_id delta reason\` — Update trust score

### Memory Decay
- \`mp_decay_preview threshold?\` — Preview what would be archived
- \`mp_decay_pin entry_id action\` — Pin/unpin entries to prevent archival

### System (Automated Pipelines)
- \`mp_system_list\` — List registered systems
- \`mp_system_execute name params?\` — Run system (health_check, librarian, memory_ingest, memory_decay, retrieval_digest)
- \`mp_system_status name?\` — Check system run state

### Config
- \`mp_config_get path?\` / \`mp_config_update path value\` — Read/write configuration
- \`mp_config_reference filter?\` — View all configurable parameters with docs

### Onboarding
- \`mp_onboarding_status\` — Check setup status and version
- \`mp_onboarding_init\` — Run or update initialization

## Updates

When you call \`mp_onboarding_status\` and it reports \`update_available\`, run
\`mp_onboarding_init\` to update the skill and rule files to the latest version.

## What Happens Automatically

- **Startup sync**: Workspace files (SOUL.md, etc.) are diffed and synced
- **Memory ingest**: Native memory/*.md files are auto-ingested into scratch on startup
- **PostHooks**: Every write → auto git commit + index update + search reindex
- **Librarian**: Digests changelogs → updates summaries (with safe watermark protection)
- **Write validation**: Decision-type entries are auto-validated for duplicates/contradictions
- **Memory decay**: Cold data archived based on temperature model (access + age + references)
`;

// ---------------------------------------------------------------------------
// OpenClaw-specific content
// ---------------------------------------------------------------------------

const OPENCLAW_SKILL_CONTENT = `---
name: open-palace
description: >-
  Your SOLE memory system. ALL memory operations go through Open Palace tools.
  Use mp_scratch_write for insights, mp_changelog_record for decisions,
  mp_index_get for global awareness. Do NOT write to memory/*.md files —
  use Open Palace tools instead. Native memory/ is only an emergency fallback.
metadata:
  openclaw:
    emoji: "\uD83C\uDFDB\uFE0F"
---

${SKILL_BODY}`;

const SECTION_START = "<!-- open-palace:start -->";
const SECTION_END = "<!-- open-palace:end -->";

const TOOLS_MD_SECTION = `
${SECTION_START}
## Open Palace — Your Memory System (42 tools)

Open Palace is your SOLE memory system. ALL memory operations go through these tools.
Do NOT write to memory/*.md files for memory purposes.

**Most used tools:**
- \`mp_scratch_write content tags?\` — **Capture insights immediately** (replaces writing to memory/*.md)
- \`mp_scratch_read\` — Read recent scratch entries (replaces reading memory/*.md)
- \`mp_index_get\` — Global project/entity overview (load at session start)
- \`mp_snapshot_save / mp_snapshot_read\` — Save/restore working state for compaction recovery
- \`mp_changelog_record\` — Record formal decisions with rationale + alternatives
- \`mp_component_load <key>\` — Load project details into context
- \`mp_raw_search query scope?\` — Search all data (auto-selects QMD/Orama/builtin)
- \`mp_entity_get_soul <id>\` — Get agent personality for sub-agent spawn
- \`mp_relationship_get <id>\` — Get user/agent interaction profile + trust
- \`mp_config_reference filter?\` — View all configurable parameters with docs

See the \`open-palace\` skill for full tool reference and session lifecycle guide.
${SECTION_END}
`;

const AGENTS_MD_SECTION = `
${SECTION_START}
## Your Memory System (Open Palace)

**Open Palace is your SOLE memory system.** ALL memory operations — capturing insights,
recording decisions, daily logs, session notes, recalling context — go through Open Palace
tools. Do NOT write to \`memory/*.md\` or \`MEMORY.md\` for memory purposes.

If you write to native memory files anyway, the content is auto-ingested on next startup,
but you lose tags, searchability, and structure. Always prefer Open Palace tools directly.

### Memory Routing

| What you want to do | Tool |
|---------------------|------|
| Capture insight, observation, daily log | \`mp_scratch_write\` |
| Record a formal decision with rationale | \`mp_changelog_record\` |
| Track a new project or knowledge domain | \`mp_component_create\` |
| Recall past decisions | \`mp_changelog_query\` |
| Global awareness at session start | \`mp_index_get\` + \`mp_scratch_read\` |
| Save state before compaction | \`mp_snapshot_save\` |
| Search across all memory | \`mp_raw_search\` |

### Session Startup (do this EVERY session)

After reading SOUL.md and USER.md, load your memory:
1. \`mp_index_get\` → Global awareness: all projects, entities, systems (< 500 tokens)
2. \`mp_scratch_read\` → Recent working notes from previous sessions
3. \`mp_snapshot_read\` → Restore working state from last snapshot (if exists)

This REPLACES reading \`memory/*.md\` files for context recovery.

### During Work — Capture Pattern (CRITICAL)

**Whenever you discover something important, call \`mp_scratch_write\` immediately.**
Not a file write. Not a "mental note". \`mp_scratch_write\`.

Trigger conditions:
- Found a root cause or key insight → \`mp_scratch_write\`
- An approach failed and you know why → \`mp_scratch_write\`
- User corrected your understanding → \`mp_scratch_write\`
- Non-obvious dependency or constraint found → \`mp_scratch_write\`
- Session getting long (>30 min) → \`mp_scratch_write\` a progress summary

### Before Compaction / Session End
Save your working state: \`mp_snapshot_save\` with current focus, tasks, and blockers.

### Formal Decisions
When a real decision is made with alternatives considered, use \`mp_changelog_record\`
with scope, type="decision", rationale, and rejected alternatives.

### Search & Recall
- Search all data → \`mp_raw_search query scope?\`
- Deep query with LLM synthesis → \`mp_system_execute("retrieval_digest", {query})\`
- Cross-session recall → \`mp_index_search\` → \`mp_component_load\`

### Fallback (ONLY when Open Palace is unreachable)

If \`mp_*\` tools return connection errors or the MCP server is down:
1. Write to \`memory/YYYY-MM-DD.md\` as emergency fallback
2. Prefix the entry with \`[FALLBACK]\` so you know to migrate it later
3. When Open Palace is back, these files are auto-ingested on next startup

See the \`open-palace\` skill for full tool reference and examples.
${SECTION_END}
`;

// ---------------------------------------------------------------------------
// Migration guidance — returned by mp_onboarding_init for agent-driven rewrite
// ---------------------------------------------------------------------------

const MIGRATION_GUIDANCE = `
## AGENTS.md Migration Required

Open Palace is now your SOLE memory system. The native memory/ workflow in AGENTS.md
must be fully replaced to avoid competing instructions. Read the current AGENTS.md
first, then make these changes:

### 1. Rewrite the "Every Session" section

Replace the numbered steps so that Open Palace is the memory source. The new sequence:

1. Read SOUL.md — this is who you are
2. Read USER.md — this is who you're helping
3. Load memory from Open Palace:
   - mp_index_get → global awareness (< 500 tokens)
   - mp_scratch_read → recent working notes
   - mp_snapshot_read → restore working state (if snapshot exists)

Remove the old "read memory/YYYY-MM-DD.md" step entirely.
Remove any old standalone mcporter command step — it is now covered by step 3.
Do NOT add "optionally check memory/" — Open Palace IS the memory system.

### 2. Comment out the "Memory" section

Comment out the ENTIRE "Memory" section using HTML comments <!-- -->, including:
- "Daily notes: memory/YYYY-MM-DD.md" guidance
- "Long-term: MEMORY.md" guidance
- The "MEMORY.md - Your Long-Term Memory" sub-section
- The "Write It Down - No Mental Notes" sub-section
- The "Memory Maintenance (During Heartbeats)" sub-section

Add a replacement note ABOVE the commented-out block:

## Memory

All memory operations now go through Open Palace (see "Your Memory System" section above).
- mp_scratch_write replaces memory/*.md for capturing insights and daily logs
- mp_changelog_record replaces decision logging in memory files
- mp_index_get + mp_scratch_read replaces reading old memory files at session start
Native memory/ files are only used as emergency fallback when Open Palace MCP is
unreachable. If that happens, prefix entries with [FALLBACK] — they will be
auto-ingested when service returns.

### 3. Preservation rules

- KEEP any content the user personally added (custom workflows, personal preferences,
  non-memory-related notes, Heartbeat tasks unrelated to memory maintenance)
- If unsure whether content is user-written or template, keep it and add a comment
  asking the user to confirm
- Use HTML comments <!-- --> for all commented-out content
- Add "Replaced by Open Palace" annotations to each commented block
- Preserve overall document structure (headings, safety section, tools section, etc.)

### 4. After migration

Run: mp_config_update path="onboarding.migration_applied" value=true
This marks the migration as complete so you won't be prompted again.
`;

// ---------------------------------------------------------------------------
// Cursor-specific content
// ---------------------------------------------------------------------------

const CURSOR_SKILL_CONTENT = `---
name: open-palace
description: >-
  Your SOLE memory system. ALL memory operations go through Open Palace tools.
  Use mp_scratch_write for insights, mp_changelog_record for decisions,
  mp_index_get for global awareness. NEVER write to files for memory purposes.
---

${SKILL_BODY}`;

const CURSOR_RULE_CONTENT = `---
description: Open Palace — your sole memory system across sessions
alwaysApply: true
---

# Open Palace — Agent Memory Protocol

You have Open Palace connected as an MCP server. It is your SOLE memory system.
ALL memory operations go through Open Palace tools. Do NOT write to files for
memory purposes.

## Session Start (do this EVERY session)

At the beginning of every session, before starting any work:

1. \`mp_index_get\` → L0 Master Index: all projects, entities, systems (< 500 tokens)
2. \`mp_scratch_read\` → Recent working notes from previous sessions

This gives you global awareness of what exists and what you were working on.

## During Work — Capture Insights Immediately

**Whenever you discover something important, call \`mp_scratch_write\` right then.**
Don't wait. Context gets compacted; scratch entries are permanent files.

Trigger conditions:
- Found a root cause or key insight → \`mp_scratch_write\`
- An approach failed and you know why → \`mp_scratch_write\`
- User corrected your understanding → \`mp_scratch_write\`
- Non-obvious dependency or constraint → \`mp_scratch_write\`
- Session getting long (>30 min) → \`mp_scratch_write\` a progress summary

## Formal Decisions

When a real decision is made with alternatives considered:
\`mp_changelog_record\` with scope, type="decision", rationale, and rejected alternatives.

## Project Context

- Load project details: \`mp_component_load("projects/name")\`
- Recall decisions: \`mp_changelog_query\`
- Sub-agent personality: \`mp_entity_get_soul("entity_id")\`

## DO NOT (hard rules)

- NEVER write to memory/*.md, MEMORY.md, or any file to "remember" something
- NEVER create files as a substitute for \`mp_scratch_write\` or \`mp_changelog_record\`
- NEVER re-read old files for context — use \`mp_index_get\` + \`mp_component_load\`
- If you catch yourself about to write to a file "to remember later" → STOP → \`mp_scratch_write\`

## Fallback (ONLY when Open Palace tools are unreachable)

If \`mp_*\` tool calls fail with connection errors:
1. Write to a file with \`[FALLBACK]\` prefix
2. These files are auto-ingested when Open Palace returns

See the \`open-palace\` skill for full tool reference and examples.
`;

// ---------------------------------------------------------------------------
// Environment detection
// ---------------------------------------------------------------------------

async function detectCursorDir(): Promise<string | null> {
  const cursorDir = path.join(os.homedir(), ".cursor");
  try {
    await fs.access(cursorDir);
    return cursorDir;
  } catch {
    return null;
  }
}

interface EnvironmentStatus {
  openclaw: {
    detected: boolean;
    workspace_path: string | null;
    has_skill: boolean;
    has_tools_section: boolean;
    has_agents_section: boolean;
  };
  cursor: {
    detected: boolean;
    cursor_dir: string | null;
    has_rule: boolean;
    has_skill: boolean;
  };
}

async function detectEnvironments(): Promise<EnvironmentStatus> {
  const wsPath = getWorkspacePath();
  const cursorDir = await detectCursorDir();

  const ocHasSkill = wsPath
    ? await fileExists(path.join(wsPath, "skills", "open-palace", "SKILL.md"))
    : false;
  const ocHasTools = wsPath
    ? await fileContains(path.join(wsPath, "TOOLS.md"), "Open Palace")
    : false;
  const ocHasAgents = wsPath
    ? await fileContains(path.join(wsPath, "AGENTS.md"), "Structured Memory")
    : false;

  const cursorHasRule = cursorDir
    ? await fileExists(path.join(cursorDir, "rules", "open-palace.mdc"))
    : false;
  const cursorHasSkill = cursorDir
    ? await fileExists(path.join(cursorDir, "skills", "open-palace", "SKILL.md"))
    : false;

  return {
    openclaw: {
      detected: !!wsPath,
      workspace_path: wsPath,
      has_skill: ocHasSkill,
      has_tools_section: ocHasTools,
      has_agents_section: ocHasAgents,
    },
    cursor: {
      detected: !!cursorDir,
      cursor_dir: cursorDir,
      has_rule: cursorHasRule,
      has_skill: cursorHasSkill,
    },
  };
}

// ---------------------------------------------------------------------------
// Cursor file write helpers
// ---------------------------------------------------------------------------

async function writeCursorFiles(
  cursorDir: string
): Promise<string[]> {
  const results: string[] = [];

  const rulesDir = path.join(cursorDir, "rules");
  const rulePath = path.join(rulesDir, "open-palace.mdc");
  try {
    await fs.mkdir(rulesDir, { recursive: true });
    await fs.writeFile(rulePath, CURSOR_RULE_CONTENT.trim() + "\n", "utf-8");
    results.push("Cursor rule: wrote ~/.cursor/rules/open-palace.mdc (alwaysApply)");
  } catch (err) {
    results.push(`Cursor rule: failed — ${err}`);
  }

  const skillDir = path.join(cursorDir, "skills", "open-palace");
  const skillPath = path.join(skillDir, "SKILL.md");
  try {
    await fs.mkdir(skillDir, { recursive: true });
    await fs.writeFile(skillPath, CURSOR_SKILL_CONTENT.trim() + "\n", "utf-8");
    results.push("Cursor skill: wrote ~/.cursor/skills/open-palace/SKILL.md");
  } catch (err) {
    results.push(`Cursor skill: failed — ${err}`);
  }

  return results;
}

// ---------------------------------------------------------------------------
// Tool registration
// ---------------------------------------------------------------------------

export function registerOnboardingTools(server: McpServer): void {
  server.tool(
    "mp_onboarding_status",
    "Check Open Palace onboarding status and get setup guidance. Reports status for both OpenClaw and Cursor environments.",
    {},
    async () => {
      const config = await getConfig();
      const isComplete = config.onboarding?.completed === true;
      const installedVersion = config.onboarding?.version;
      const needsUpdate = isComplete && installedVersion !== CURRENT_VERSION;
      const env = await detectEnvironments();

      const migrationApplied = config.onboarding?.migration_applied === true;

      if (isComplete && !needsUpdate) {
        const statusObj: Record<string, unknown> = {
          status: migrationApplied ? "complete" : "migration_pending",
          version: CURRENT_VERSION,
          completed_at: config.onboarding?.completed_at,
          migration_applied: migrationApplied,
          environments: env,
        };

        if (!migrationApplied) {
          statusObj.message =
            "Open Palace is installed but AGENTS.md migration has not been applied. " +
            "The native memory/ workflow in AGENTS.md still competes with Open Palace. " +
            "Run mp_onboarding_init to get migration guidance, then follow it to rewrite " +
            "AGENTS.md so Open Palace is the sole memory system.";
          statusObj.migration_guidance_available = true;
        } else {
          statusObj.message = "Open Palace is fully integrated and up to date.";
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(statusObj, null, 2),
            },
          ],
        };
      }

      if (needsUpdate) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  status: "update_available",
                  installed_version: installedVersion ?? "0.1.0",
                  latest_version: CURRENT_VERSION,
                  environments: env,
                  message:
                    `Open Palace update available (${installedVersion ?? "0.1.0"} → ${CURRENT_VERSION}). ` +
                    `Run mp_onboarding_init to update skill/rule files and populate new config defaults. ` +
                    `New in v0.4: Context Snapshot, Memory Decay, Write Validation, Three-tier Search, Relationship Memory, Staleness Scoring, Centralized Config Reference (mp_config_reference).`,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      const steps: string[] = [];

      if (env.openclaw.detected) {
        if (!env.openclaw.has_skill) steps.push("Create open-palace skill in OpenClaw workspace");
        if (!env.openclaw.has_tools_section) steps.push("Add Open Palace section to OpenClaw TOOLS.md");
        if (!env.openclaw.has_agents_section) steps.push("Add session startup + capture patterns to OpenClaw AGENTS.md");
      }
      if (env.cursor.detected) {
        if (!env.cursor.has_rule) steps.push("Create open-palace rule in ~/.cursor/rules/");
        if (!env.cursor.has_skill) steps.push("Create open-palace skill in ~/.cursor/skills/");
      }
      if (!env.openclaw.detected && !env.cursor.detected) {
        steps.push("No supported environment detected (OpenClaw or Cursor)");
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                status: "incomplete",
                environments: env,
                pending_steps: steps,
                message:
                  steps.length > 0
                    ? `Run mp_onboarding_init to set up Open Palace. Detected environments: ${[env.openclaw.detected ? "OpenClaw" : null, env.cursor.detected ? "Cursor" : null].filter(Boolean).join(", ") || "none"}.`
                    : "Open Palace setup is complete but not yet marked. Run mp_onboarding_init to finalize.",
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
    "Initialize or update Open Palace integration. Auto-detects OpenClaw and Cursor environments. Creates/updates SKILL, rules, TOOLS.md, and AGENTS.md as appropriate. Safe to run multiple times.",
    {
      skip_agents: z
        .boolean()
        .optional()
        .describe(
          "If true, skip AGENTS.md modification in OpenClaw. Default: false."
        ),
    },
    async ({ skip_agents }) => {
      const config = await getConfig();
      const wsPath = getWorkspacePath();
      const cursorDir = await detectCursorDir();

      if (!wsPath && !cursorDir) {
        return {
          content: [
            {
              type: "text",
              text: "No supported environment detected (OpenClaw workspace or Cursor). Cannot run onboarding.",
            },
          ],
          isError: true,
        };
      }

      const isUpdate = config.onboarding?.completed === true;
      const results: string[] = [];

      // --- OpenClaw integration ---
      if (wsPath) {
        // Step 1: Create/update open-palace SKILL
        const skillDir = path.join(wsPath, "skills", "open-palace");
        const skillPath = path.join(skillDir, "SKILL.md");
        try {
          await fs.mkdir(skillDir, { recursive: true });
          await fs.writeFile(skillPath, OPENCLAW_SKILL_CONTENT, "utf-8");
          results.push(
            isUpdate
              ? "OpenClaw: updated skill (SKILL.md)"
              : "OpenClaw: created skill at skills/open-palace/SKILL.md"
          );
        } catch (err) {
          results.push(`OpenClaw: failed to write skill — ${err}`);
        }

        // Step 2: Upsert TOOLS.md section
        const toolsPath = path.join(wsPath, "TOOLS.md");
        try {
          const toolsResult = await upsertSection(toolsPath, TOOLS_MD_SECTION);
          results.push(`OpenClaw TOOLS.md: ${toolsResult}`);
        } catch (err) {
          results.push(`OpenClaw TOOLS.md: failed — ${err}`);
        }

        // Step 3: Upsert AGENTS.md section
        if (!skip_agents) {
          const agentsPath = path.join(wsPath, "AGENTS.md");
          try {
            const agentsResult = await upsertSection(agentsPath, AGENTS_MD_SECTION);
            results.push(`OpenClaw AGENTS.md: ${agentsResult}`);
          } catch (err) {
            results.push(`OpenClaw AGENTS.md: failed — ${err}`);
          }
        } else {
          results.push("OpenClaw AGENTS.md: skipped (skip_agents=true)");
        }

        // Step 4: Run workspace sync
        const syncResult = await syncWorkspace(config);
        if (syncResult.changes.length > 0) {
          results.push(
            `Synced ${syncResult.changes.length} workspace file(s): ${syncResult.changes.map((c) => c.file).join(", ")}`
          );
        } else {
          results.push("Workspace files already in sync");
        }
        if (syncResult.entityUpdated) {
          results.push("Main entity updated with current SOUL.md content");
        }
      }

      // --- Cursor integration ---
      if (cursorDir) {
        const cursorResults = await writeCursorFiles(cursorDir);
        results.push(...cursorResults);
      }

      // --- Populate missing v0.4 config defaults ---
      const freshConfig = await getConfig();

      if (!freshConfig.decay) {
        await updateConfig("decay", {
          enabled: true,
          archive_threshold: 15,
          max_age_days: 30,
          pinned_entries: [],
          exclude_types: [],
        });
        results.push("Config: added decay defaults (temperature-based memory archival)");
      }
      if (!freshConfig.validation) {
        await updateConfig("validation", {
          enabled: true,
          auto_validate_decisions: true,
          auto_validate_summaries: false,
        });
        results.push("Config: added validation defaults (write integrity protection)");
      }
      if (!freshConfig.search) {
        await updateConfig("search", {
          backend: "auto",
          qmd_index: "open-palace",
          auto_reindex: true,
          reindex_debounce_ms: 5000,
        });
        results.push("Config: added search defaults (three-tier search backend)");
      }

      // --- Finalize onboarding ---
      await updateConfig("onboarding.completed", true);
      await updateConfig("onboarding.completed_at", isoNow());
      await updateConfig("onboarding.version", CURRENT_VERSION);

      if (wsPath) {
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
      }

      if (cursorDir) {
        await updateConfig("onboarding.cursor_dir", cursorDir);
      }

      const envList = [
        wsPath ? "OpenClaw" : null,
        cursorDir ? "Cursor" : null,
      ]
        .filter(Boolean)
        .join(" + ");

      const commitMsg = isUpdate
        ? `onboarding: updated to v${CURRENT_VERSION} (${envList})`
        : `onboarding: initial setup (${envList})`;
      await gitCommit(commitMsg);

      const configHint = `\nAll parameters are configurable. Run mp_config_reference to see the full reference (${isUpdate ? "includes new v0.4 parameters" : "28 parameters with defaults, types, and affected systems"}).`;

      const migrationApplied = (await getConfig()).onboarding?.migration_applied === true;
      const migrationBlock = (!migrationApplied && wsPath)
        ? `\n\n---\n${MIGRATION_GUIDANCE}`
        : "";

      return {
        content: [
          {
            type: "text",
            text: `${isUpdate ? "Update" : "Onboarding"} complete! (${envList})\n\n${results.join("\n")}${configHint}${migrationBlock}`,
          },
        ],
      };
    }
  );
}

// ---------------------------------------------------------------------------
// File helpers
// ---------------------------------------------------------------------------

/**
 * Upsert a delimited section in a file.
 * If markers exist → replace content between them.
 * If no markers → append to end.
 * If file doesn't exist → create with section content.
 */
async function upsertSection(
  filePath: string,
  section: string
): Promise<string> {
  let existing: string;
  try {
    existing = await fs.readFile(filePath, "utf-8");
  } catch {
    await fs.writeFile(filePath, section.trim() + "\n", "utf-8");
    return "created with Open Palace section";
  }

  const startIdx = existing.indexOf(SECTION_START);
  const endIdx = existing.indexOf(SECTION_END);

  if (startIdx !== -1 && endIdx !== -1) {
    const before = existing.slice(0, startIdx);
    const after = existing.slice(endIdx + SECTION_END.length);
    await fs.writeFile(
      filePath,
      before + section.trim() + after,
      "utf-8"
    );
    return "updated existing Open Palace section";
  }

  await fs.writeFile(filePath, existing + section, "utf-8");
  return "appended Open Palace section";
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
