# Open Palace

A storage-compute separated Agent memory system — local MCP Server for structured knowledge management.

Open Palace replaces reliance on LLM memory with deterministic engineering infrastructure: structured indexes, changelogs, version control, and automated pipelines. Agents don't need to "remember" — they just need to "find."

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                   MCP Server (stdio)                 │
│                                                     │
│  ┌──────────────┐  ┌──────────────┐                │
│  │ Entity       │  │ Component    │                │
│  │ Registry     │  │ Store        │                │
│  └──────────────┘  └──────────────┘                │
│  ┌──────────────┐  ┌──────────────┐                │
│  │ 3-Level      │  │ Dual-Layer   │                │
│  │ Index System │  │ Changelog    │                │
│  └──────────────┘  └──────────────┘                │
│  ┌──────────────┐  ┌──────────────┐                │
│  │ PostHook     │  │ System       │                │
│  │ Engine       │  │ Store        │                │
│  └──────────────┘  └──────────────┘                │
│                                                     │
│              Persistence Layer                       │
│  ~/.open-palace/ (YAML + Markdown + Git)             │
└─────────────────────────────────────────────────────┘
```

## Features

- **MCP Server** — stdio transport, compatible with Claude Code, Cursor, OpenClaw, and any MCP client
- **Entity Registry** — agent identity management with SOUL content and evolution history
- **3-Level Index** — L0 Master Index (< 500 tokens global awareness), L1 component summaries, L2 raw data
- **Component Store** — self-contained knowledge modules (projects, knowledge, skills, relationships)
- **Dual-Layer Changelog** — operation logs (auto-generated) + decision logs (with alternatives)
- **PostHook Engine** — automatic git commits and index updates on every write
- **Librarian** — three-layer automated summarization (digest / synthesis / review) powered by LLM
- **Health Check** — data integrity validation (index consistency, orphan detection, staleness, git status)
- **System Store** — executable pipeline registry with state tracking and configuration
- **Configuration** — YAML-based config with dot-path access

## Quick Start

### Prerequisites

- Node.js >= 18 (recommended: v22)
- npm

### Install & Build

```bash
cd /path/to/open-palace
npm install
npm run build
```

### Deploy to OpenClaw

1. Build the project:

```bash
cd /path/to/open-palace
npm run build
```

2. Edit OpenClaw config (`~/.openclaw/openclaw.json`), add to `mcpServers`:

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

3. Restart OpenClaw. All `mp_*` tools will be available to the agent. The Librarian will automatically use OpenClaw's LLM via MCP Sampling — no API key needed.

4. (Optional) Mention the tools in your `AGENTS.md` so the agent knows they exist:

```markdown
## Available MCP Tools
- `mp_index_get` — get global awareness (L0 Master Index)
- `mp_component_load` — load a knowledge module into context
- `mp_changelog_record` — record operations and decisions
- `mp_system_execute` — run Librarian or Health Check
```

### Deploy to Claude Desktop

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

### Deploy to Cursor

Add to Cursor MCP settings (`.cursor/mcp.json` in your project or global settings):

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

### Verify Installation

After connecting, ask the agent to run:
- `mp_index_get` — should return the L0 Master Index
- `mp_system_list` — should show `librarian` and `health_check`
- `mp_system_execute` with `name: "health_check"` — should return a health report

## MCP Tools

### Index

| Tool | Description |
|------|-------------|
| `mp_index_get` | Get L0 Master Index — global awareness (< 500 tokens) |
| `mp_index_search` | Search L0 by keyword |

### Entity

| Tool | Description |
|------|-------------|
| `mp_entity_list` | List all registered entities |
| `mp_entity_get_soul` | Get SOUL/personality for sub-agent injection |
| `mp_entity_get_full` | Full entity data with evolution history |
| `mp_entity_create` | Create a new entity |
| `mp_entity_update_soul` | Update SOUL with change tracking |
| `mp_entity_log_evolution` | Append evolution record |

### Component

| Tool | Description |
|------|-------------|
| `mp_component_list` | List components by type |
| `mp_component_create` | Create a new knowledge module |
| `mp_component_load` | Load into context (L1 summary + changelog) |
| `mp_component_unload` | Unload from context |
| `mp_summary_get` | Get L1 summary |
| `mp_summary_update` | Update L1 summary |

### Changelog

| Tool | Description |
|------|-------------|
| `mp_changelog_record` | Record operation or decision entry |
| `mp_changelog_query` | Query with scope/type/agent filters |

### System

| Tool | Description |
|------|-------------|
| `mp_system_list` | List registered systems with run state |
| `mp_system_execute` | Execute a system (librarian, health_check) |
| `mp_system_status` | Check system status and run history |
| `mp_system_configure` | Update system config via dot-path |

### Config

| Tool | Description |
|------|-------------|
| `mp_config_get` | Read config by dot-path |
| `mp_config_update` | Update config value |

## Librarian Usage

The Librarian automates knowledge summarization. Execute via MCP tools:

```
mp_system_execute("librarian", {level: "digest"})             # Summarize recent changes
mp_system_execute("librarian", {level: "digest", scope: "projects/alpha"})  # Single component
mp_system_execute("librarian", {level: "synthesis"})           # Weekly cross-component analysis
mp_system_execute("librarian", {level: "review"})              # Monthly full rebuild
```

### LLM Configuration

The Librarian needs LLM access. Three modes are supported (configurable via `llm.mode` in `config.yaml`):

| Mode | Behavior | When to Use |
|------|----------|-------------|
| `auto` (default) | Try MCP Sampling first, fall back to direct API | Works everywhere — zero-config with sampling-capable hosts |
| `sampling` | Only use host's LLM via MCP Sampling | When you want to guarantee no external API calls |
| `direct` | Only use Anthropic API directly | When host doesn't support sampling |

**MCP Sampling** means Open Palace asks the host application (OpenClaw, Claude Desktop, Cursor) to perform the LLM call. No separate API key needed — it reuses the host's existing LLM configuration.

If sampling is unavailable (host doesn't support it), set up a direct API key:
- Environment variable: `ANTHROPIC_API_KEY`
- Or in `~/.open-palace/config.yaml`:

```yaml
llm:
  mode: auto                    # auto | sampling | direct
  model: claude-sonnet-4-20250514  # optional, for direct mode
  anthropic_api_key: sk-...     # optional, for direct mode
```

## Data Directory

All data is stored under `~/.open-palace/` with full git version control:

```
~/.open-palace/
├── config.yaml              # Server configuration
├── .git/                    # Version control
├── index/
│   ├── master.md            # L0 Master Index
│   ├── weekly/              # Librarian weekly summaries
│   └── monthly/             # Librarian monthly reviews
├── entities/                # Agent identity registry
├── components/
│   ├── projects/            # Project knowledge modules
│   ├── knowledge/           # Knowledge domain modules
│   ├── skills/              # Skill/tool modules
│   └── relationships/       # Relationship tracking
├── changelogs/              # Global changelogs (by month)
├── system-state.yaml        # System execution state tracking
├── librarian-state.yaml     # Librarian last-run timestamps
└── sync/                    # Host environment sync config
```

## Development

```bash
# Type check
npm run typecheck

# Build
npm run build

# Run E2E tests
npx tsx src/test-e2e.ts
```

## Roadmap

- **Phase 1** ✅ MCP Server skeleton + Entity + Index + Component + Changelog + PostHook
- **Phase 2** ✅ (covered in Phase 1) L0/L1/Component/Changelog core logic
- **Phase 3** ✅ Librarian (digest/synthesis/review) + System Store + Health Check
- **Phase 4** — L2 RAG + Retrieval+Digest + Relationship memory + Session PostHook
- **Phase 5** — CLI tools + Claude Code adapter + SOUL.md sync + open-source release

## License

MIT
