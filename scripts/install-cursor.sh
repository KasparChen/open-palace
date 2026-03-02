#!/bin/bash
#
# Open Palace — Cursor Installation Script
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/KasparChen/open-palace/main/scripts/install-cursor.sh | bash
#
# Or manually:
#   bash scripts/install-cursor.sh
#
# What it does:
#   1. Clones and builds Open Palace (or updates if already installed)
#   2. Registers it as an MCP server in Cursor (global or project-level)
#   3. Installs the Cursor rule and skill files for agent behavior guidance

set -euo pipefail

INSTALL_DIR="${OPEN_PALACE_DIR:-$HOME/open-palace}"
CURSOR_DIR="$HOME/.cursor"
REPO_URL="https://github.com/KasparChen/open-palace.git"

info()  { echo "  [open-palace] $*"; }
error() { echo "  [open-palace] ERROR: $*" >&2; }

# --- Step 1: Clone or update ---

if [ -d "$INSTALL_DIR/.git" ]; then
  info "Updating existing installation at $INSTALL_DIR ..."
  cd "$INSTALL_DIR"
  git pull --ff-only || { error "git pull failed. Resolve conflicts manually."; exit 1; }
else
  info "Cloning Open Palace to $INSTALL_DIR ..."
  git clone "$REPO_URL" "$INSTALL_DIR"
  cd "$INSTALL_DIR"
fi

# --- Step 2: Install dependencies and build ---

info "Installing dependencies ..."
npm install --silent

info "Building ..."
npm run build --silent

ENTRY_POINT="$INSTALL_DIR/dist/index.js"

if [ ! -f "$ENTRY_POINT" ]; then
  error "Build failed — dist/index.js not found"
  exit 1
fi

info "Build successful: $ENTRY_POINT"

# --- Step 3: Register MCP server in Cursor ---

MCP_CONFIG="$CURSOR_DIR/mcp.json"

register_mcp() {
  local config_path="$1"
  local config_dir
  config_dir=$(dirname "$config_path")
  mkdir -p "$config_dir"

  if [ -f "$config_path" ]; then
    if command -v python3 &>/dev/null; then
      python3 -c "
import json, sys
with open('$config_path', 'r') as f:
    config = json.load(f)
servers = config.setdefault('mcpServers', {})
servers['open-palace'] = {
    'command': 'node',
    'args': ['$ENTRY_POINT']
}
with open('$config_path', 'w') as f:
    json.dump(config, f, indent=2)
print('  [open-palace] Updated $config_path')
"
    else
      info "Cannot auto-update $config_path (python3 not found). Add manually:"
      echo ""
      echo "  {\"mcpServers\": {\"open-palace\": {\"command\": \"node\", \"args\": [\"$ENTRY_POINT\"]}}}"
      echo ""
    fi
  else
    cat > "$config_path" << MCPEOF
{
  "mcpServers": {
    "open-palace": {
      "command": "node",
      "args": ["$ENTRY_POINT"]
    }
  }
}
MCPEOF
    info "Created $config_path"
  fi
}

register_mcp "$MCP_CONFIG"

# --- Step 4: Install Cursor rule and skill ---

info "Installing Cursor rule and skill ..."

mkdir -p "$CURSOR_DIR/rules"
mkdir -p "$CURSOR_DIR/skills/open-palace"

cat > "$CURSOR_DIR/rules/open-palace.mdc" << 'RULEEOF'
---
description: Open Palace cognitive memory system — persistent structured memory across sessions
alwaysApply: true
---

# Open Palace — Agent Memory Protocol

You have Open Palace connected as an MCP server. It provides persistent structured memory that survives across sessions and context compaction.

## Session Start (do this EVERY session)

At the beginning of every session, before starting any work:

1. `mp_index_get` → L0 Master Index: all projects, entities, systems (< 500 tokens)
2. `mp_snapshot_read` → Restore working state (if snapshot exists)
3. `mp_scratch_read` → Recent working notes from previous sessions

This gives you global awareness of what exists and what you were working on.

## During Work — Capture Insights Immediately

**Whenever you discover something important, call `mp_scratch_write` right then.**
Don't wait. Context gets compacted; scratch entries are permanent files.

Trigger conditions:
- Found a root cause or key insight → `mp_scratch_write`
- An approach failed and you know why → `mp_scratch_write`
- User corrected your understanding → `mp_scratch_write`
- Non-obvious dependency or constraint → `mp_scratch_write`
- Session getting long (>30 min) → `mp_scratch_write` a progress summary

## Formal Decisions

When a real decision is made with alternatives considered:
`mp_changelog_record` with scope, type="decision", rationale, and rejected alternatives.

## Project Context

- Load project details: `mp_component_load("projects/name")`
- Recall decisions: `mp_changelog_query`
- Sub-agent personality: `mp_entity_get_soul("entity_id")`

See the `open-palace` skill for full tool reference and examples.
RULEEOF

info "Wrote rule: $CURSOR_DIR/rules/open-palace.mdc"

# Skill file is larger — copy from repo if available, otherwise inline
if [ -f "$INSTALL_DIR/scripts/SKILL.md" ]; then
  cp "$INSTALL_DIR/scripts/SKILL.md" "$CURSOR_DIR/skills/open-palace/SKILL.md"
else
  # Inline minimal skill pointing to MCP tools
  cat > "$CURSOR_DIR/skills/open-palace/SKILL.md" << 'SKILLEOF'
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
Run `mp_onboarding_status` to check setup, then `mp_onboarding_init` to get
the full skill content with detailed tool reference and behavioral guide.

## Quick Start

```
mp_index_get        → L0 Master Index (global awareness)
mp_scratch_read     → Recent working notes
mp_scratch_write    → Capture insight immediately
mp_changelog_record → Record formal decision
```

Run `mp_onboarding_init` for the complete setup.
SKILLEOF
fi

info "Wrote skill: $CURSOR_DIR/skills/open-palace/SKILL.md"

# --- Done ---

echo ""
info "Installation complete!"
info ""
info "What was set up:"
info "  MCP Server:  $MCP_CONFIG"
info "  Cursor Rule: $CURSOR_DIR/rules/open-palace.mdc (alwaysApply)"
info "  Cursor Skill: $CURSOR_DIR/skills/open-palace/SKILL.md"
info ""
info "Next steps:"
info "  1. Restart Cursor to load the new MCP server"
info "  2. The agent will automatically use Open Palace in every session"
info "  3. Optionally run mp_onboarding_init to complete initialization"
info ""
info "To update later: cd $INSTALL_DIR && git pull && npm run build && bash scripts/install-cursor.sh"
