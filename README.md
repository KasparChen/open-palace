# Open Palace — The Mind Palace of Your Agent

The ECS-structured cognitive memory system for AI agents.

*Awareness, rather than memory.*

> [中文文档](./README.zh-CN.md)

---

Open Palace is the first ECS-like (Entity-Component-System) cognitive system for AI agents, delivered as a local MCP Server.

It starts from one premise: **agents are unreliable instruction followers**. Tell an agent "always commit after changes." It will forget, skip, or get the format wrong. So everything that must happen is a code-level pipeline (PostHook Engine), not a line in the system prompt.

This is not a memory plugin. Open Palace manages the full cognitive stack:

- Who the agent *is* (Entity Registry with bidirectional SOUL sync and personality evolution tracking)
- What the agent *knows* (Component Store with three-level indexing)
- What the agent *decided and why* (dual-layer changelog with rationale and rejected alternatives)
- What happens *automatically* (System Store with Librarian, Health Check, and extensible pipelines)

All stored locally in `~/.open-palace/`, a self-contained git repo you own.

### The problem

Current agent frameworks manage cognition through context instructions and markdown files. This breaks in predictable ways:

- **Sub-agents spawn as blank slates.** A spawned "CMO" sub-agent knows nothing about what the last "CMO" did. An independent agent with the same role? Completely separate entity, zero shared state.
- **Cross-session memory doesn't exist.** Each new session starts from scratch. Without structured logs, summaries, or a version-controlled store, there is no mechanism to carry decisions and context forward. What was decided last week? The agent has no way to know.
- **Long context degrades accuracy.** Within a session, instruction-following accuracy drops as context grows. Compaction and pruning discard by chunks rather than selectively, often losing decision context along the way.
- **Redundant context across agents.** In multi-agent conversations, every participant carries the full context when each only needs a fraction. There is no structural indexing mechanism for selective loading.
- **Memory files lack protection.** Without version control or structural constraints, agents can overwrite existing memory with contradictory information, with no way to roll back.
- **Prompt instructions are unreliable.** Context instructions are advisory. Agents may forget, skip, or misformat them. Critical operations need code-level guarantees.

Open Palace addresses these with deterministic engineering: storage-compute separation, code-level PostHooks, three-level indexing, and git-backed version control.

---

## TLDR

First ECS-architecture cognitive system for AI agents. Identity + knowledge + decisions, with engineering guarantees.

1. **ECS architecture.** Entity Registry (identity/personality) + Component Store (knowledge modules) + System Store (automated pipelines). Load/unload on demand.
2. **Three-level index.** L0 Master Index (< 500 tokens, always in context) for global awareness. L1 summaries on demand. L2 raw data by targeted query. Agents don't carry context; they know what exists and load what they need.
3. **Versioned personality.** Bidirectional SOUL sync between host workspace and Open Palace. Evolution history on every change. Git rollback. Personality doesn't drift silently; it evolves with a paper trail.
4. **Traceable decisions.** Dual-layer changelog: auto-generated operation logs + agent-recorded decision logs with rationale and rejected alternatives. "Why did we pick SQLite?" is in the changelog, not someone's memory.
5. **Code-level guarantees.** PostHook Engine fires git commits, index updates, and changelog writes on every write operation. Code pipelines, not prompt instructions.
6. **Fully local, fully portable.** `~/.open-palace/` is a self-contained git repo. YAML + Markdown + Git. No cloud dependency. `cp -r` to any machine.

---

## What is ECS?

ECS (Entity-Component-System) is an architecture pattern from the game industry, used in engines behind Overwatch, Dwarf Fortress, and countless MMOs. Unlike OOP inheritance hierarchies where behavior is baked into class trees, ECS decouples identity (Entity), data (Component), and behavior (System).

The result is a modular, extensible architecture. You can add new data types or behaviors without touching existing code.

In Open Palace:

| ECS concept | Open Palace implementation |
|-------------|---------------------------|
| **Entity** | Agent identity: SOUL content, personality, evolution history |
| **Component** | Knowledge module: projects, skills, knowledge domains, relationships. Each self-contained with its own summary and changelog. |
| **System** | Automated pipeline: Librarian (summarization), Health Check (integrity validation). Extensible via registration. |

Need a new knowledge domain? Create a Component. Need a new automated workflow? Register a System. Agent identity, knowledge, and maintenance routines are fully decoupled.

---

## How agents use Open Palace

**Session startup.** The agent calls `mp_index_get` and receives the L0 Master Index in < 500 tokens. Now it knows every project, entity, and system that exists. No searching, no guessing.

**Loading context on demand.** User asks about a project. The agent matches it against L0, calls `mp_component_load("projects/my-app")`, gets the L1 summary and recent decisions. Only what's needed enters the context.

**Recording decisions.** The agent calls `mp_changelog_record` with the decision, rationale, and rejected alternatives. PostHook handles git commit, L0 update, and global changelog automatically. The agent doesn't manage any of this.

**Spawning sub-agents.** Main agent calls `mp_entity_get_soul("cmo")` for the sub-agent's personality, loads relevant Component summaries, and injects both into the spawn prompt. The sub-agent starts informed, not blank.

**Background maintenance.** Librarian digests changelogs into updated L1 summaries daily, runs cross-component analysis weekly, rebuilds L0 monthly. Health Check validates data integrity. All code-level, no agent involvement.

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
│  │  Bidirectional    │  │  Load/Unload      │  │  Extensible   │  │
│  │  Workspace Sync   │  │  Per-component    │  │  Code-level   │  │
│  │                   │  │  Changelog        │  │  Pipelines    │  │
│  └──────────────────┘  └──────────────────┘  └──────────────┘  │
│                                                                  │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────┐  │
│  │  3-Level Index    │  │  Dual-Layer      │  │  PostHook     │  │
│  │  L0: Global Map   │  │  Changelog       │  │  Engine       │  │
│  │  L1: Summaries    │  │  Operations      │  │  Auto git     │  │
│  │  L2: Raw Data     │  │  + Decisions     │  │  Auto index   │  │
│  └──────────────────┘  └──────────────────┘  └──────────────┘  │
│                                                                  │
│  ┌──────────────────┐  ┌──────────────────┐                     │
│  │  Onboarding      │  │  Workspace Sync   │                    │
│  │  Auto-discovery   │  │  SHA256 diffing   │                    │
│  │  Guided setup     │  │  SOUL writeback   │                    │
│  └──────────────────┘  └──────────────────┘                     │
│                                                                  │
│                     Persistence Layer                             │
│          ~/.open-palace/ (YAML + Markdown + Git)                 │
└──────────────────────────────────────────────────────────────────┘
```

### Three-level index

```
Level 0: Master Index — always in context, < 500 tokens
  Compressed notation with all projects, entities, systems at a glance.
  Agent knows what exists and can decide what to load.

Level 1: Component Summaries — loaded on demand
  Per-project/knowledge/skill summaries maintained by the Librarian.
  Rich enough for most questions, avoids loading raw data.

Level 2: Raw Data — never directly in context
  Full changelogs, documents, code. Accessed via targeted search.
```

**Retrieval flow** (progressive unpacking, not brute-force loading):

```
User: "What did we decide about the database last month?"

Step 1: L0 match (zero-cost, already in context)
  → Master Index → hits [P] my-project

Step 2: L1 load (one tool call)
  → mp_component_load("projects/my-project")
  → Returns summary with decisions and current state

Step 3: L2 search (only if needed)
  → mp_changelog_query({scope: "projects/my-project", type: "decision"})
  → Returns specific decisions with rationale and rejected alternatives
```

---

## Quick start

### Prerequisites

- Node.js >= 18 (recommended: v22)
- npm

### Install & build

```bash
git clone https://github.com/kasparchen/open-palace.git
cd open-palace
npm install
npm run build
```

### Connect to your MCP host

**Claude Desktop** — edit `~/Library/Application Support/Claude/claude_desktop_config.json`:

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

**Cursor** — add to `.cursor/mcp.json` (project-level or global):

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

**OpenClaw** — add to `~/.openclaw/workspace/config/mcporter.json`:

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

### Verify

Ask the agent to run:

```
mp_index_get          → Should return the L0 Master Index
mp_system_list        → Should show librarian and health_check
mp_onboarding_status  → Should report setup status
```

### Onboarding (OpenClaw)

For OpenClaw users, Open Palace has a guided onboarding flow. After connecting the MCP Server, copy and paste this prompt to your agent:

```
I have the Open Palace MCP Server connected. Please:
1. Run mp_onboarding_status to check setup
2. Run mp_onboarding_init to initialize (creates skill file, updates TOOLS.md, syncs workspace files)
3. Add mp_index_get to the session startup flow in AGENTS.md so every new session automatically loads global awareness
4. Verify by running mp_index_get
```

After onboarding, every new session will automatically discover and use Open Palace tools.

---

## MCP tools (24 tools)

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

### Changelog: decision tracking

| Tool | Description |
|------|-------------|
| `mp_changelog_record` | Record operation or decision (with rationale + rejected alternatives) |
| `mp_changelog_query` | Query by scope, type, agent, time range |

### System: automated pipelines

| Tool | Description |
|------|-------------|
| `mp_system_list` | List registered systems with run state |
| `mp_system_execute` | Execute system (librarian, health_check) |
| `mp_system_status` | Check run history and status |
| `mp_system_configure` | Update system config |

### Config

| Tool | Description |
|------|-------------|
| `mp_config_get` | Read configuration by dot-path |
| `mp_config_update` | Update configuration value |

### Onboarding

| Tool | Description |
|------|-------------|
| `mp_onboarding_status` | Check setup status, get guidance for incomplete steps |
| `mp_onboarding_init` | Run initial setup: create skill, update TOOLS.md, sync workspace files |

---

## Key systems

### Librarian

Processes changelogs into summaries at three levels:

| Level | Default schedule | What it does |
|-------|-----------------|-------------|
| **Digest** | Daily | Summarize recent changelog entries → update L1 summaries → update L0 timestamps |
| **Synthesis** | Weekly | Cross-component correlation analysis → weekly report → identify project interdependencies |
| **Review** | Monthly | Full L0 rebuild → trend analysis → monthly report → cleanup recommendations |

```bash
# Execute manually
mp_system_execute("librarian", {level: "digest"})
mp_system_execute("librarian", {level: "synthesis"})
mp_system_execute("librarian", {level: "digest", scope: "projects/myapp"})
```

The Librarian uses the host's LLM via MCP Sampling by default (no API key needed). Falls back to direct Anthropic API if sampling is unavailable. Configurable via `llm.mode` in `config.yaml`.

### Health check

Validates the entire memory system:
- Index consistency (L0 entries vs actual component directories)
- Orphan detection (components without index entries, or vice versa)
- Staleness detection (changelogs with unprocessed entries)
- Git status (uncommitted changes)
- Entity sync status

### Workspace sync

Open Palace detects changes in the host workspace (SOUL.md, AGENTS.md, etc.) using SHA256 diffing on every MCP server startup:

- **Workspace → Open Palace**: Changed files are backed up. SOUL.md changes update the main entity with evolution tracking.
- **Open Palace → Workspace**: `mp_entity_update_soul` writes back to the workspace SOUL.md.
- All changes are git-committed with full rollback history.

### PostHook engine

Every write operation triggers automatic side effects:

| Operation | Auto-triggered |
|-----------|---------------|
| Entity created/updated | Git commit + evolution log |
| Changelog recorded | Git commit + L0 timestamp update |
| Summary updated | Git commit + L0 update |
| Component created | Directory structure + L0 entry + git commit |

Code-level pipelines. The agent doesn't need to "remember" to commit or update indexes.

---

## Data directory

All data lives in `~/.open-palace/`, a self-contained git repository:

```
~/.open-palace/
├── config.yaml                 # Server configuration
├── .git/                       # Full version control history
├── index/
│   ├── master.md               # L0 Master Index (< 500 tokens)
│   ├── weekly/                 # Librarian weekly synthesis reports
│   └── monthly/                # Librarian monthly review reports
├── entities/                   # Agent identity registry (YAML)
│   ├── main.yaml
│   └── cto.yaml
├── components/
│   ├── projects/               # Project knowledge modules
│   │   └── my-project/
│   │       ├── summary.md      # L1 summary (Librarian-maintained)
│   │       ├── changelog.yaml  # Per-project operation + decision logs
│   │       └── raw/            # L2 raw data
│   ├── knowledge/              # Knowledge domain modules
│   ├── skills/                 # Skill/tool modules
│   └── relationships/          # Relationship tracking
├── changelogs/                 # Global changelogs (by month)
│   └── 2026-02.yaml
├── sync/
│   ├── sync-state.yaml         # SHA256 hashes + sync timestamps
│   └── workspace-backup/       # Host workspace file backups
├── system-state.yaml           # System execution tracking
└── librarian-state.yaml        # Librarian run timestamps
```

---

## Configuration

`~/.open-palace/config.yaml`:

```yaml
version: "0.1.0"
data_dir: "~/.open-palace"

librarian:
  schedules:
    digest:
      interval: daily       # hourly | daily | weekly | monthly | manual
      time: "02:00"
    synthesis:
      interval: weekly
      time: "Sun 03:00"
    review:
      interval: monthly
      time: "1st 04:00"
  llm:
    model: claude-sonnet

llm:
  mode: auto                # auto | sampling | direct
  # model: claude-sonnet-4-20250514    # for direct mode
  # anthropic_api_key: sk-...          # for direct mode, or use ANTHROPIC_API_KEY env

# Auto-populated after onboarding
workspace_sync:
  host: openclaw
  workspace_path: /home/node/.openclaw/workspace
  watched_files: [SOUL.md, IDENTITY.md, USER.md, AGENTS.md, TOOLS.md]
  entity_mapping:
    main: main

onboarding:
  completed: true
  completed_at: "2026-02-25T14:35:34.057Z"
```

---

## Development

```bash
npm run typecheck    # Type check without emitting
npm run build        # Compile TypeScript
npx tsx src/test-e2e.ts   # Run E2E tests (44 assertions)
```

## Roadmap

- **Phase 1** ✅ MCP Server + Entity + Index + Component + Changelog + PostHook
- **Phase 2** ✅ L0/L1/Component/Changelog core logic
- **Phase 3** ✅ Librarian + System Store + Health Check
- **Phase 3.5** ✅ Onboarding + Bidirectional Workspace Sync
- **Phase 4** — L2 RAG + Retrieval+Digest + Relationship memory

---

## Acknowledgments

The initial design research involved studying memory and personality mechanics in six game systems — Dwarf Fortress, Disco Elysium, the Nemesis System (Shadow of Mordor/War), Baldur's Gate 3, Crusader Kings 3, and Planescape: Torment. The main takeaway was conceptual: layered memory structures, the idea that memory should be visible and queryable rather than implicit, and that relationships can be captured as tagged interactions. We didn't port any game mechanics directly — LLM agents don't need state machines or personality score systems — but these games shaped how we think about the problem space.

The following projects had direct, concrete influence on the architecture:

- [Generative Agents](https://github.com/joonspk-research/generative_agents) (Stanford) — The paper that proved "structured external memory + LLM reflection" actually works. Before this, it wasn't obvious that giving agents an explicit memory store would outperform just relying on longer context. Open Palace's entire premise — that agents should write to and read from a persistent structured store rather than depend on context window — traces back to this work.
- [MemGPT / Letta](https://github.com/letta-ai/letta) — Introduced explicit memory tiers with load/unload operations, treating LLM context as a managed resource rather than a dump. Our Component mount/unmount and the "Awareness > Context" principle come from the same insight: the agent shouldn't carry everything, it should know what's available and page things in.
- [HippoRAG](https://github.com/OSU-NLP-Group/HippoRAG) — Hippocampus-inspired hierarchical retrieval that mirrors how human memory works: broad pattern matching first, then progressively narrowing to specific details. This directly shaped our L0→L1→L2 progressive unpacking flow — start from a compressed global index, drill down only when needed.
- [OpenViking](https://github.com/volcengine/OpenViking) — Tiered context loading with Abstract / Overview / Details levels for on-demand delivery. The most direct inspiration for our three-level index design (L0 Master Index / L1 Component Summary / L2 Raw Data).
- [A-MEM](https://github.com/WujiangXu/A-mem) — Agentic memory with Zettelkasten-style self-organizing notes. Reinforced the idea that memory entries should be interconnected and that the agent itself can decide how to organize its knowledge.
- [Mem0](https://github.com/mem0ai/mem0) — Memory as a standalone infrastructure layer, cleanly separated from the agent runtime. Validated the storage-compute separation principle that underlies Open Palace: deterministic engineering handles persistence, LLM handles reasoning.
- [Zep](https://github.com/getzep/zep) / [Graphiti](https://github.com/getzep/graphiti) — Temporal-aware knowledge graphs that treat time as a first-class dimension in agent memory. Influenced our changelog's time-based querying and the design of decision traceability (knowing not just *what* was decided, but *when* and *what was rejected*).
- [MCP](https://modelcontextprotocol.io/) (Anthropic) — The protocol layer that makes Open Palace host-agnostic. Without MCP as an open standard, building a memory system that works across Claude Desktop, Cursor, OpenClaw, and others would require per-host adapters.
- [OpenClaw](https://github.com/nicepkg/openclaw) — The first host environment we integrated with. OpenClaw's workspace file conventions (SOUL.md, AGENTS.md, TOOLS.md) directly shaped the bidirectional sync and onboarding design.

**Further reading:** [Thread by @lijiuer92](https://x.com/lijiuer92/status/2025678747509391664) — good analysis of agent memory architectures.

---

## License

MIT
