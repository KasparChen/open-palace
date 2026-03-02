---
name: open-palace
description: >-
  Persistent cognitive memory system for agents. Provides structured memory
  (projects, decisions, entities) and zero-friction scratch capture that
  survives context compaction. Use at EVERY session start for global awareness,
  during work to capture insights, and for cross-session recall of projects,
  decisions, and agent identities.
---

# Open Palace — Structured Memory + Working Scratchpad

Open Palace is your persistent cognitive system delivered as an MCP server.
Data lives in \`~/.open-palace/\`, a local git-versioned store you own.

Two layers:

1. **Scratch** (working memory) — zero-friction capture. Drop insights the moment
   they happen. Survives compaction because it's a file, not context.
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

### 2. Working — Capture Patterns

**The single most important behavior: capture insights immediately.**

When you notice something important during any work — debugging, exploring,
discussing — call \`mp_scratch_write\` right then. Don't wait. Don't plan to
"write it up later." Context will be compacted; scratch entries won't.

**Trigger conditions for mp_scratch_write:**

- You discovered a root cause → scratch it
- An approach failed and you know why → scratch it
- The user corrected your understanding → scratch it
- You found a non-obvious dependency → scratch it
- You made a judgment call without formal decision → scratch it
- The session is getting long (>30min) → scratch a summary so far

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

| Situation | Tool | Why |
|-----------|------|-----|
| Mid-work insight, root cause found | \`mp_scratch_write\` | Zero friction, survives compaction |
| Quick observation during debugging | \`mp_scratch_write\` | Capture first, organize later |
| Confirmed project decision (with alternatives) | \`mp_changelog_record\` | Formal, traceable, with rationale |
| New project or knowledge domain | \`mp_component_create\` | Creates indexed structure |
| "What projects do I have?" | \`mp_index_get\` | Global awareness |
| "What did we decide about X?" | \`mp_changelog_query\` | Decision traceability |
| Sub-agent personality for spawn | \`mp_entity_get_soul\` | Consistent identity |
| Search across all data | \`mp_raw_search\` | L2 search (QMD/Orama/builtin) |
| Deep query with synthesis | \`mp_system_execute("retrieval_digest")\` | L0→L1→L2 + LLM digest |
| Preserve state before compaction | \`mp_snapshot_save\` | Instant recovery after compaction |
| System health / maintenance | \`mp_system_execute("health_check")\` | Data integrity + staleness check |

**Key principle:** If in doubt, prefer \`mp_scratch_write\`. It's the lowest-friction
way to persist anything. Organize later.

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
