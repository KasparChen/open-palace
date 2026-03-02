# Open Palace — The Mind Palace of Your Agent

The ECS-structured cognitive memory system for AI agents.

*Awareness, rather than memory.*

> [中文文档](./README.zh-CN.md)

---

Open Palace is an ECS-like (Entity-Component-System) cognitive system for AI agents, delivered as a local MCP Server.

It starts from one premise: **agents are unreliable instruction followers**. Tell an agent "always commit after changes." It will forget, skip, or get the format wrong. So everything that must happen is a code-level pipeline (PostHook Engine), not a line in the system prompt.

This is not a memory plugin. Open Palace manages the full cognitive stack:

- Who the agent *is* (Entity Registry with bidirectional SOUL sync and personality evolution tracking)
- What the agent *knows* (Component Store with three-level indexing and L2 hybrid search)
- What the agent *decided and why* (dual-layer changelog with rationale and rejected alternatives)
- Who the agent *interacts with* (Relationship Memory with interaction tags and trust tracking)
- What happens *automatically* (System Store with Librarian, Memory Decay, Health Check, and extensible pipelines)

All stored locally in `~/.open-palace/`, a self-contained git repo you own.

### The problem

Current agent frameworks manage cognition through context instructions and markdown files. This breaks in predictable ways:

- **Sub-agents spawn as blank slates.** A spawned "CMO" sub-agent knows nothing about what the last "CMO" did. An independent agent with the same role? Completely separate entity, zero shared state.
- **Cross-session memory doesn't exist.** Each new session starts from scratch. Without structured logs, summaries, or a version-controlled store, there is no mechanism to carry decisions and context forward. What was decided last week? The agent has no way to know.
- **Long context degrades accuracy.** Within a session, instruction-following accuracy drops as context grows. Compaction and pruning discard by chunks rather than selectively, often losing decision context along the way.
- **Redundant context across agents.** In multi-agent conversations, every participant carries the full context when each only needs a fraction. There is no structural indexing mechanism for selective loading.
- **Memory files lack protection.** Without version control or structural constraints, agents can overwrite existing memory with contradictory information, with no way to roll back.
- **Memories only accumulate, never forget.** Without active forgetting, retrieval noise grows with every file. After months of use, finding the right information becomes harder, not easier.
- **Prompt instructions are unreliable.** Context instructions are advisory. Agents may forget, skip, or misformat them. Critical operations need code-level guarantees.

Open Palace addresses these with deterministic engineering: storage-compute separation, code-level PostHooks, three-level indexing, temperature-based memory decay, write validation, and git-backed version control.

---

## Highlighted features

**Temperature-based memory decay.** Memories aren't permanent. Open Palace scores every entry with a temperature based on age, access frequency, and reference count. Cold data gets archived automatically. Pinned entries are protected. The Librarian's safe watermark ensures nothing is archived before it has been digested. The result: retrieval stays precise even after months of accumulated data.

**Compaction-resilient context snapshot.** When the host evicts context, the agent recovers instantly. `mp_snapshot_save` writes a real-time overwrite-only state file — current focus, active tasks, blockers, recent decisions. After compaction, `mp_snapshot_read` restores working state in one call. Not a session log. A save point.

**Write integrity protection.** Before a memory enters the system, it can be validated against existing data. The validation layer detects four risk types: duplicates, contradictions, hallucinated facts, and stale overrides. Decision-type entries are validated automatically. The principle: never trust an agent's write blindly.

**Three-tier pluggable search.** L2 search uses whichever backend is available: QMD (BM25 + vector + LLM reranking) when installed, Orama BM25 as an embedded fallback, or simple keyword scan as a last resort. No RAG pipeline to build. The Retrieval+Digest system combines L0/L1/L2 results with LLM synthesis for structured answers.

**Relationship memory with trust tracking.** Tagged interaction patterns accumulate over time. Trust scores evolve based on explicit events. The agent builds a structured profile of each user or collaborator — communication style, expertise, preferences — that informs future interactions.

**Centralized configuration reference.** Every tunable parameter across all subsystems — 28 parameters covering Librarian schedules, decay thresholds, validation rules, search backends, and more — is documented in a single queryable reference with defaults, types, affected systems, and code locations. `mp_config_reference` returns the full table, filterable by keyword.

---

## TLDR

ECS-architecture cognitive system for AI agents. Identity + knowledge + decisions + relationships, with engineering guarantees.

1. **ECS architecture.** Entity Registry (identity/personality) + Component Store (knowledge modules) + System Store (automated pipelines). Load/unload on demand.
2. **Three-level index.** L0 Master Index (< 500 tokens, always in context) for global awareness. L1 summaries on demand. L2 raw data by targeted search. Agents don't carry context; they know what exists and load what they need.
3. **Working memory scratchpad.** Zero-friction `mp_scratch_write` captures insights mid-work — no scope, no type, just content. Survives compaction. Native `memory/*.md` files are auto-ingested on startup. Scratch entries get promoted to structured components when ready.
4. **Compaction-resilient snapshot.** Overwrite-only state file that agents read immediately after context eviction to restore focus, tasks, and decisions in one call.
5. **Versioned personality.** Bidirectional SOUL sync between host workspace and Open Palace. Evolution history on every change. Git rollback. Personality doesn't drift silently; it evolves with a paper trail.
6. **Traceable decisions.** Dual-layer changelog: auto-generated operation logs + agent-recorded decision logs with rationale and rejected alternatives. Pre-write validation catches duplicates, contradictions, and hallucinated memories.
7. **Temperature-based memory decay.** Active forgetting based on age, access patterns, and reference counts. Cold data is archived, not deleted. Librarian safe watermark prevents data loss. Retrieval stays precise as data grows.
8. **Three-tier pluggable search.** QMD hybrid search when available, Orama BM25 as embedded fallback, simple scan as last resort. Retrieval+Digest system synthesizes answers from L0/L1/L2 with LLM.
9. **Relationship memory.** Interaction tags, trust scores, user profiles. The agent learns how to interact with each user over time.
10. **Code-level guarantees.** PostHook Engine fires git commits, index updates, changelog writes, and search reindex on every write operation. Code pipelines, not prompt instructions.
11. **Fully local, fully portable.** `~/.open-palace/` is a self-contained git repo. YAML + Markdown + Git. No cloud dependency. `cp -r` to any machine.

---

## What is ECS?

ECS (Entity-Component-System) is an architecture pattern from the game industry, used in engines behind Overwatch, Dwarf Fortress, and countless MMOs. Unlike OOP inheritance hierarchies where behavior is baked into class trees, ECS decouples identity (Entity), data (Component), and behavior (System).

In Open Palace:

| ECS concept | Open Palace implementation |
|-------------|---------------------------|
| **Entity** | Agent identity: SOUL content, personality, evolution history |
| **Component** | Knowledge module: projects, skills, knowledge domains, relationships. Each self-contained with its own summary and changelog. |
| **System** | Automated pipeline: Librarian (summarization), Memory Decay (archival), Health Check (integrity), Retrieval+Digest (search). Extensible via registration. |

Need a new knowledge domain? Create a Component. Need a new automated workflow? Register a System. Agent identity, knowledge, and maintenance routines are fully decoupled.

---

## How agents use Open Palace

**Session startup.** The agent calls `mp_index_get`, `mp_snapshot_read`, and `mp_scratch_read`. Now it has the L0 Master Index (< 500 tokens, global awareness), restored working state from the last snapshot, and recent scratch notes. Full context recovery in three calls.

**Capturing insights mid-work.** During debugging, exploration, or discussion, the agent calls `mp_scratch_write` the moment it discovers something important. Root cause found? Scratch it. Approach failed? Scratch why. User corrected an assumption? Scratch it. Zero friction — just content and optional tags. These entries survive compaction because they're files, not context.

**Loading context on demand.** User asks about a project. The agent matches it against L0, calls `mp_component_load("projects/my-app")`, gets the L1 summary and recent decisions. Only what's needed enters the context.

**Recording decisions.** The agent calls `mp_changelog_record` with the decision, rationale, and rejected alternatives. PostHook handles git commit, L0 update, and global changelog automatically. Decision entries are validated against existing data to catch duplicates and contradictions.

**Searching across all data.** `mp_raw_search` queries changelogs, summaries, and scratch entries using the best available backend. For deeper queries, `retrieval_digest` combines L0/L1/L2 results with LLM synthesis.

**Saving state before compaction.** The agent calls `mp_snapshot_save` with current focus, active tasks, and blockers. After compaction, `mp_snapshot_read` restores everything instantly.

**Passive memory ingest.** Even if the agent writes to native `memory/*.md` files instead of Open Palace, those files are automatically ingested into the scratch layer on every MCP server startup via SHA256 diffing.

**Spawning sub-agents.** Main agent calls `mp_entity_get_soul("cmo")` for the sub-agent's personality, loads relevant Component summaries, and injects both into the spawn prompt. The sub-agent starts informed, not blank.

**Background maintenance.** Librarian digests changelogs into updated L1 summaries daily, runs cross-component analysis weekly, rebuilds L0 monthly. Memory Decay archives cold data based on temperature scores. Health Check validates data integrity and flags stale knowledge. All code-level, no agent involvement.

---

## Five design principles

1. **Storage-compute separation.** Deterministic engineering (indexes, changelogs, git) handles persistence. LLM handles reasoning. Each does what it's good at.
2. **Awareness > Context.** The agent doesn't carry everything. It carries a compressed global index (< 500 tokens) and has structural awareness of what exists. Information loads on demand.
3. **Agent agnostic.** New session, different model, context evicted: the agent fully reconstructs awareness from Open Palace's structured data.
4. **Engineering pipelines > prompt instructions.** Things that must happen (git commits, index updates, changelog writes) are code-level PostHooks, not LLM instructions that might be forgotten.
5. **Portability > recall.** All state is serializable, transferable, version-controlled. Copy `~/.open-palace/` to any machine.

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                        MCP Server (stdio)                        │
│                                                                  │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────┐  │
│  │  Entity Registry  │  │  Component Store  │  │ System Store  │  │
│  │  Identity + SOUL  │  │  Projects/Skills  │  │  Librarian    │  │
│  │  Evolution Log    │  │  Knowledge/Rels   │  │  Health Check │  │
│  │  Bidirectional    │  │  Load/Unload      │  │  Memory Decay │  │
│  │  Workspace Sync   │  │  Per-component    │  │  Retrieval+   │  │
│  │                   │  │  Changelog        │  │  Digest       │  │
│  └──────────────────┘  └──────────────────┘  └──────────────┘  │
│                                                                  │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────┐  │
│  │  3-Level Index    │  │  Dual-Layer      │  │  PostHook     │  │
│  │  L0: Global Map   │  │  Changelog       │  │  Engine       │  │
│  │  L1: Summaries    │  │  + Write         │  │  Auto git     │  │
│  │  L2: Search/RAG   │  │  Validation      │  │  Auto index   │  │
│  └──────────────────┘  └──────────────────┘  └──────────────┘  │
│                                                                  │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────┐  │
│  │  Context Snapshot │  │  Workspace Sync   │  │  3-Tier      │  │
│  │  Compaction       │  │  SHA256 diffing   │  │  Search      │  │
│  │  Recovery         │  │  SOUL writeback   │  │  QMD/Orama/  │  │
│  │                   │  │                   │  │  builtin     │  │
│  └──────────────────┘  └──────────────────┘  └──────────────┘  │
│                                                                  │
│                     Persistence Layer                             │
│          ~/.open-palace/ (YAML + Markdown + Git)                 │
└──────────────────────────────────────────────────────────────────┘
```

---

## Quick start

### Prerequisites

- Node.js >= 18 (recommended: v22)
- npm

### Cursor (recommended — one-line install)

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/KasparChen/open-palace/main/scripts/install-cursor.sh)
```

This clones, builds, registers the MCP server in `~/.cursor/mcp.json`, and installs the Cursor rule + skill files. The agent will automatically use Open Palace in every session — no manual configuration needed.

If you prefer manual setup:

```bash
git clone https://github.com/kasparchen/open-palace.git ~/open-palace
cd ~/open-palace && npm install && npm run build
bash scripts/install-cursor.sh
```

### Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "open-palace": {
      "command": "node",
      "args": ["/absolute/path/to/open-palace/dist/index.js"]
    }
  }
}
```

### OpenClaw

Add to `~/.openclaw/workspace/config/mcporter.json`:

```json
{
  "servers": {
    "open-palace": {
      "command": "node",
      "args": ["/absolute/path/to/open-palace/dist/index.js"]
    }
  }
}
```

Then run `mp_onboarding_init` to set up SKILL, TOOLS.md, and AGENTS.md automatically.

### Verify

Ask the agent to run:

```
mp_index_get          → Should return the L0 Master Index
mp_system_list        → Should show 6 registered systems
mp_onboarding_status  → Should report setup status
```

### Updating

```bash
cd ~/open-palace && git pull && npm install && npm run build

# For Cursor: re-run the install script to update rule/skill files
bash scripts/install-cursor.sh

# For OpenClaw: run mp_onboarding_init — it detects version changes and updates automatically
```

Or let the agent handle it: `mp_onboarding_status` reports when an update is available, and `mp_onboarding_init` applies it.

---

## MCP tools (42 tools)

### Scratch: working memory

| Tool | Description |
|------|-------------|
| `mp_scratch_write` | Capture an insight instantly — just content + optional tags. Zero friction. |
| `mp_scratch_read` | Read recent scratch entries (today + yesterday). Use at session start. |
| `mp_scratch_promote` | Promote scratch entry to a component scope |

### Snapshot: compaction recovery

| Tool | Description |
|------|-------------|
| `mp_snapshot_save` | Save real-time working state (overwrites previous). Use before compaction. |
| `mp_snapshot_read` | Restore working state instantly after compaction or session start. |

### Index: global awareness

| Tool | Description |
|------|-------------|
| `mp_index_get` | L0 Master Index, global awareness in < 500 tokens |
| `mp_index_search` | Search L0 by keyword |

### Entity: agent identity

| Tool | Description |
|------|-------------|
| `mp_entity_list` | List all registered agent identities |
| `mp_entity_get_soul` | Get SOUL/personality (for sub-agent spawn injection) |
| `mp_entity_get_full` | Full entity with evolution history |
| `mp_entity_create` | Register new agent identity |
| `mp_entity_update_soul` | Update SOUL content (bidirectional: also writes back to workspace SOUL.md) |
| `mp_entity_log_evolution` | Append evolution record |

### Component: knowledge modules

| Tool | Description |
|------|-------------|
| `mp_component_list` | List components by type |
| `mp_component_create` | Create project / knowledge / skill / relationship module |
| `mp_component_load` | Load into context (returns L1 summary + recent changelog) |
| `mp_component_unload` | Unload from context |
| `mp_summary_get` | Get L1 summary |
| `mp_summary_update` | Update L1 summary |
| `mp_summary_verify` | Mark summary as reviewed and up-to-date (resets staleness) |

### Changelog: decision tracking

| Tool | Description |
|------|-------------|
| `mp_changelog_record` | Record operation or decision (with rationale + rejected alternatives). Supports pre-write validation. |
| `mp_changelog_query` | Query by scope, type, agent, time range |
| `mp_validate_write` | Standalone pre-write validation: detect duplicates, contradictions, hallucinations, stale overrides |

### Search: L2 retrieval

| Tool | Description |
|------|-------------|
| `mp_raw_search` | Search all data using best available backend (QMD > Orama > builtin) |
| `mp_search_reindex` | Manually rebuild the search index |
| `mp_search_status` | Check active search backend, indexed item count, last reindex time |

### Relationship: interaction memory

| Tool | Description |
|------|-------------|
| `mp_relationship_get` | Get full relationship record (profile + interaction tags + trust + history) |
| `mp_relationship_update_profile` | Update entity profile (style, expertise, preferences) |
| `mp_relationship_log_interaction` | Log interaction tags (auto-accumulates counts) |
| `mp_relationship_update_trust` | Update trust score with reason (clamped 0.0-1.0) |

### Memory decay: active forgetting

| Tool | Description |
|------|-------------|
| `mp_decay_preview` | Preview what would be archived (dry-run with temperature scores) |
| `mp_decay_pin` | Pin/unpin entries to prevent or allow archival |

### System: automated pipelines

| Tool | Description |
|------|-------------|
| `mp_system_list` | List registered systems with run state |
| `mp_system_execute` | Execute system (librarian, health_check, memory_ingest, memory_decay, retrieval_digest) |
| `mp_system_status` | Check run history and status (includes Librarian safe watermark) |
| `mp_system_configure` | Update system config |

### Config

| Tool | Description |
|------|-------------|
| `mp_config_get` | Read configuration by dot-path |
| `mp_config_update` | Update configuration value |
| `mp_config_reference` | View all 28 configurable parameters with defaults, types, affected systems, and code locations |

### Onboarding

| Tool | Description |
|------|-------------|
| `mp_onboarding_status` | Check setup status, get guidance for incomplete steps |
| `mp_onboarding_init` | Run initial setup: create skill, update TOOLS.md, sync workspace files |

---

## Key systems

### Librarian

Processes changelogs and scratch entries into summaries at multiple levels:

| Level | Default schedule | What it does |
|-------|-----------------|-------------|
| **Digest** | Daily | Summarize recent changelog entries + matching scratch notes into L1 summaries. Tracks per-component coverage with safe watermark. |
| **Synthesis** | Weekly | Cross-component correlation analysis, weekly report, project interdependencies |
| **Review** | Monthly | Full L0 rebuild, trend analysis, monthly report, cleanup recommendations |
| **Scratch triage** | On demand | Analyze unpromoted scratch entries, match to components, suggest promotions |

The Librarian uses the host's LLM via MCP Sampling by default (no API key needed). Falls back to direct Anthropic API if sampling is unavailable.

### Memory decay

Temperature-based active forgetting that keeps retrieval precise as data grows:

- Each entry gets a temperature score: `age_base + access_bonus + reference_bonus + pin_bonus`
- Entries below the archive threshold are moved to `archive/` (not deleted)
- The Librarian's safe watermark prevents archiving unprocessed data
- Pinned entries are permanently protected (temperature 999)
- Configurable: `decay.archive_threshold`, `decay.max_age_days`, `decay.pinned_entries`

### Retrieval + Digest

Progressive L0 to L1 to L2 retrieval with LLM synthesis:

- Three-tier search backend: QMD (hybrid search with BM25 + vector + reranking) when available, Orama (embedded BM25) as fallback, simple keyword scan as last resort
- `mp_raw_search` returns raw matching snippets with relevance scores
- `retrieval_digest` system synthesizes structured answers by combining summaries and search results with LLM

### Health check

Validates the entire memory system:
- Index consistency (L0 entries vs actual component directories)
- Orphan detection (components without index entries, or vice versa)
- Staleness scoring (components not verified in 60+ days flagged as stale)
- Git status (uncommitted changes)
- Entity sync status

### Memory ingest

Even if the agent writes to native `memory/*.md` files, Open Palace captures the content automatically on every MCP server startup via SHA256 diffing. The passive safety net — the agent doesn't need to change behavior for content to flow into Open Palace.

### PostHook engine

Every write operation triggers automatic side effects — git commit, index update, changelog write, search reindex. Code-level pipelines. The agent doesn't need to "remember" to commit or update indexes.

---

## Development

```bash
npm run typecheck    # Type check without emitting
npm run build        # Compile TypeScript
npx tsx src/test-e2e.ts   # Run E2E tests (138 assertions)
```

## Roadmap

- **Phase 1** -- MCP Server + Entity + Index + Component + Changelog + PostHook
- **Phase 2** -- L0/L1/Component/Changelog core logic
- **Phase 3** -- Librarian + System Store + Health Check
- **Phase 3.5** -- Onboarding + Bidirectional Workspace Sync
- **v0.2** -- Working Memory Layer (Scratch + Memory Ingest + Librarian scratch triage)
- **v0.3** -- Cursor Integration (rule + skill auto-install, multi-environment onboarding)
- **v0.4** -- Context Snapshot, Librarian Safety Gate, Memory Decay, Write Validation, Relationship Memory, Three-tier Search (QMD/Orama/builtin), Retrieval+Digest, Staleness Scoring, Centralized Config Reference

---

## Acknowledgments

The initial design research involved studying memory and personality mechanics in six game systems — Dwarf Fortress, Disco Elysium, the Nemesis System (Shadow of Mordor/War), Baldur's Gate 3, Crusader Kings 3, and Planescape: Torment. The main takeaway was conceptual: layered memory structures, the idea that memory should be visible and queryable rather than implicit, and that relationships can be captured as tagged interactions. We didn't port any game mechanics directly — LLM agents don't need state machines or personality score systems — but these games shaped how we think about the problem space.

The following projects and writings had direct influence on the architecture:

- [Generative Agents](https://github.com/joonspk-research/generative_agents) (Stanford) — The paper that proved "structured external memory + LLM reflection" actually works. Open Palace's entire premise — that agents should write to and read from a persistent structured store rather than depend on context window — traces back to this work.
- [MemGPT / Letta](https://github.com/letta-ai/letta) — Introduced explicit memory tiers with load/unload operations, treating LLM context as a managed resource. Our Component mount/unmount and the "Awareness > Context" principle come from the same insight.
- [HippoRAG](https://github.com/OSU-NLP-Group/HippoRAG) — Hippocampus-inspired hierarchical retrieval. This directly shaped our L0 to L1 to L2 progressive unpacking flow.
- [OpenViking](https://github.com/volcengine/OpenViking) — Tiered context loading with Abstract / Overview / Details levels. The most direct inspiration for our three-level index design.
- [A-MEM](https://github.com/WujiangXu/A-mem) — Agentic memory with Zettelkasten-style self-organizing notes. Reinforced the idea that memory entries should be interconnected.
- [Mem0](https://github.com/mem0ai/mem0) — Memory as a standalone infrastructure layer. Validated the storage-compute separation principle.
- [Zep](https://github.com/getzep/zep) / [Graphiti](https://github.com/getzep/graphiti) — Temporal-aware knowledge graphs. Influenced our changelog's time-based querying and decision traceability design.
- [Ray Wang's OpenClaw memory management guide](https://x.com/wangray/status/2027034737311907870) — A practitioner's report from 30 days of running 5 agents with structured memory. The temperature-based decay model, "digest before forget" safety principle, NOW.md compaction recovery pattern, and CRUD write validation approach were directly inspired by insights from this writeup. Open Palace implements these patterns with code-level guarantees rather than prompt-based instructions.
- [MCP](https://modelcontextprotocol.io/) (Anthropic) — The protocol layer that makes Open Palace host-agnostic.
- [OpenClaw](https://github.com/nicepkg/openclaw) — The first host environment we integrated with. OpenClaw's workspace file conventions directly shaped the bidirectional sync and onboarding design.
- [QMD](https://github.com/tobi/qmd) — Local hybrid search engine (BM25 + vector + LLM reranking). Open Palace's three-tier search backend uses QMD as the highest-quality option when available.

**Further reading:** [Thread by @lijiuer92](https://x.com/lijiuer92/status/2025678747509391664) — good analysis of agent memory architectures.

---

## License

MIT
