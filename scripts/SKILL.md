---
name: open-palace
description: >-
  Your SOLE memory system. ALL memory operations go through Open Palace tools.
  Use mp_scratch_write for insights, mp_changelog_record for decisions,
  mp_session_start for global awareness. NEVER write to files for memory purposes.
---

# Open Palace — Your Memory System

Open Palace is your SOLE memory system, delivered as an MCP server.
ALL memory operations go through Open Palace tools. Do NOT write to files
(`memory/*.md`, `MEMORY.md`, etc.) for memory purposes — use Open Palace tools instead.
Data lives in `~/.open-palace/`, a local git-versioned store you own.

Two layers:

1. **Scratch** (working memory) — zero-friction capture via `mp_scratch_write`.
   Drop insights the moment they happen. Survives compaction because it's a
   persistent file, not session context.
2. **Components** (structured memory) — projects, decisions, entities. Organized,
   indexed, version-controlled.

## Session Lifecycle

### 1. Startup — Load Awareness (ONE call)

At the beginning of every session, call:

```
mp_session_start       → Returns L0 Master Index + working state snapshot + recent scratch notes
```

This single call replaces the old 3-step ritual (mp_index_get + mp_snapshot_read + mp_scratch_read).
Even if you forget, the first time you call ANY Open Palace tool, session context is auto-injected.
This REPLACES reading memory/*.md files for context recovery.

### 2. Working — Capture Patterns

**The single most important behavior: capture insights immediately via Open Palace.**

When you notice something important during any work — debugging, exploring,
discussing — call `mp_scratch_write` right then. Not a file write. Not a
"mental note". `mp_scratch_write`. Context will be compacted; scratch entries won't.

**Trigger conditions for mp_scratch_write:**

- You discovered a root cause → `mp_scratch_write`
- An approach failed and you know why → `mp_scratch_write`
- The user corrected your understanding → `mp_scratch_write`
- You found a non-obvious dependency → `mp_scratch_write`
- You made a judgment call without formal decision → `mp_scratch_write`
- The session is getting long (>30min) → `mp_scratch_write` a summary
- Daily log or session notes → `mp_scratch_write` with tags

**Examples:**

```
mp_scratch_write content="Root cause: model validation runs against live catalog,
not schema. That's why tests pass but prod fails." tags=["debug","liteLetter"]

mp_scratch_write content="Approach A (Redis pub/sub) won't work — requires
persistent connection, but our workers are serverless." tags=["liteLetter","architecture"]

mp_scratch_write content="User clarification: they want email-first, web archive
is secondary. Reverses our earlier assumption." tags=["liteLetter","requirements"]
```

### 3. Formal Decisions — Use Changelog

When a real decision is made (with rationale and rejected alternatives), record it
formally:

```
mp_changelog_record scope="projects/liteLetter" type="decision"
  decision="Use Resend for email delivery"
  rationale="Simple API, good deliverability, free tier sufficient for MVP"
  alternatives=[{option:"SendGrid", rejected_because:"Overkill for our volume"},
                {option:"AWS SES", rejected_because:"Complex setup, poor DX"}]
  summary="Email provider selection"
```

### 4. Session End / Long Session

**Quick path (recommended):** Call `mp_session_end` with your learnings summary.
It auto-writes scratch + entity evolution in one call.

For longer sessions (>1hr or >50k tokens), also:

1. `mp_snapshot_save` with current focus and active tasks
2. Promote important scratch entries to components: `mp_scratch_promote`
3. If relevant, update component summaries: `mp_summary_update`

### 5. Spawning Sub-Agents

When you spawn a sub-agent with a specific identity:

1. Call `mp_spawn_context(entity_id, task?)` to get the context block
2. Inject the returned text into the sub-agent's prompt
3. The context includes a completion protocol that tells the sub-agent to call
   `mp_session_end` before returning

## When to Use What

| Situation | Tool |
|-----------|------|
| **Session start (FIRST action)** | **`mp_session_start`** |
| Mid-work insight, root cause found | `mp_scratch_write` |
| Quick observation during debugging | `mp_scratch_write` |
| Daily log, session notes | `mp_scratch_write` (with tags) |
| Confirmed project decision (with alternatives) | `mp_changelog_record` |
| New project or knowledge domain | `mp_component_create` |
| "What projects do I have?" | `mp_index_get` |
| "What did we decide about X?" | `mp_changelog_query` |
| Spawning a sub-agent with context | `mp_spawn_context` |
| Session/sub-agent ending | `mp_session_end` |
| Sub-agent personality for spawn | `mp_entity_get_soul` |
| Search across all data | `mp_raw_search` |
| Deep query with synthesis | `mp_system_execute("retrieval_digest")` |
| Preserve state before compaction | `mp_snapshot_save` |
| System health / maintenance | `mp_system_execute("health_check")` |

**Key principle:** If in doubt, use `mp_scratch_write`. It's the lowest-friction
way to persist anything. NEVER write to a file to "remember" something.

## Fallback (ONLY when Open Palace is unreachable)

If `mp_*` tool calls fail with connection errors or the MCP server is down:
1. Write to `memory/YYYY-MM-DD.md` as emergency fallback
2. Prefix the entry with `[FALLBACK]` so you know to migrate it later
3. When Open Palace is back, these files are auto-ingested on next startup

## Tool Quick Reference

### Session & Agent Lifecycle (START HERE)
- `mp_session_start` — **Load full memory context in one call** (L0 index + snapshot + recent scratch). Call FIRST.
- `mp_spawn_context entity_id task? include_components?` — Generate context block for sub-agent spawn (soul + components + scratch + completion protocol)
- `mp_session_end learnings entity_id? tags?` — Capture session/sub-agent learnings → scratch + evolution log. Call BEFORE completing.

### Scratch (Working Memory)
- `mp_scratch_write content tags?` — Capture insight immediately (NEVER write files instead)
- `mp_scratch_read date? tags? include_yesterday?` — Read recent entries
- `mp_scratch_promote scratch_id scope` — Promote entry to a component

### Snapshot (Compaction Recovery)
- `mp_snapshot_save current_focus ...` — Save working state (overwrites previous)
- `mp_snapshot_read` — Restore working state after compaction

### Index (Global Awareness)
- `mp_index_get` — L0 Master Index (or use mp_session_start for full startup)
- `mp_index_search query` — Find matching entries

### Entity (Agent Identity)
- `mp_entity_list` — All registered agent identities
- `mp_entity_get_soul entity_id` — Get personality definition
- `mp_entity_get_full entity_id` — Full entity with evolution history
- `mp_entity_create` — Register new agent identity
- `mp_entity_update_soul entity_id content reason` — Update personality

### Component (Projects / Knowledge)
- `mp_component_list type?` — List all components
- `mp_component_create type key summary` — Create new module
- `mp_component_load key` — Load into context (summary + recent changelog)
- `mp_component_unload key` — Remove from active context
- `mp_summary_get key` / `mp_summary_update key content` — Read/write L1 summary
- `mp_summary_verify key` — Mark summary as reviewed and up-to-date

### Changelog (Decision Tracking)
- `mp_changelog_record` — Record decision (with rationale + rejected alternatives)
- `mp_changelog_query` — Query by scope, type, time range
- `mp_validate_write` — Pre-write validation (detect duplicates, contradictions)

### Search (L2 RAG)
- `mp_raw_search query scope? limit?` — Search all data (auto-selects QMD/Orama/builtin)
- `mp_search_reindex` — Manually rebuild search index
- `mp_search_status` — Check active search backend and index stats

### Relationship (Interaction Memory)
- `mp_relationship_get entity_id` — Get profile + interaction tags + trust
- `mp_relationship_update_profile entity_id ...` — Update user/agent profile
- `mp_relationship_log_interaction entity_id tags[]` — Log interaction patterns
- `mp_relationship_update_trust entity_id delta reason` — Update trust score

### Memory Decay
- `mp_decay_preview threshold?` — Preview what would be archived
- `mp_decay_pin entry_id action` — Pin/unpin entries to prevent archival

### System (Automated Pipelines)
- `mp_system_list` — List registered systems
- `mp_system_execute name params?` — Run system (health_check, librarian, memory_ingest, memory_decay, retrieval_digest)
- `mp_system_status name?` — Check system run state

### Config
- `mp_config_get path?` / `mp_config_update path value` — Read/write configuration
- `mp_config_reference filter?` — View all configurable parameters with docs

### Onboarding
- `mp_onboarding_status` — Check setup status and version
- `mp_onboarding_init` — Run or update initialization

## Updates

When you call `mp_onboarding_status` and it reports `update_available`, run
`mp_onboarding_init` to update the skill and rule files to the latest version.

## What Happens Automatically

- **Session guard**: First tool call auto-injects L0 index + snapshot (even if you skip mp_session_start)
- **Startup sync**: Workspace files (SOUL.md, etc.) are diffed and synced
- **Memory ingest**: Native memory/*.md files are auto-ingested into scratch on startup (fallback recovery)
- **PostHooks**: Every write → auto git commit + index update + search reindex
- **Librarian**: Digests changelogs → updates summaries (with safe watermark protection)
- **Write validation**: Decision-type entries are auto-validated for duplicates/contradictions
- **Memory decay**: Cold data archived based on temperature model (access + age + references)
- **Overdue systems**: Cron-scheduled systems (librarian digest, health check, memory decay) auto-execute at startup if overdue
