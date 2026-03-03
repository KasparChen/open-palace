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
description: Open Palace memory system — call mp_session_start first
alwaysApply: true
---

# Open Palace Memory Protocol

MANDATORY FIRST ACTION: Call `mp_session_start` before any work.
This loads your full memory context (L0 index + snapshot + recent scratch) in one call.
Even if you skip this, context is auto-injected on your first Open Palace tool call.

## During Work
- Insight or discovery → `mp_scratch_write` (NEVER write to files)
- Formal decision with alternatives → `mp_changelog_record`
- Load project details → `mp_component_load`
- Before compaction or session end → `mp_snapshot_save`

## NEVER
- NEVER write to memory/*.md, MEMORY.md, SPEC.md, or any file to "remember" something
- NEVER create files as a substitute for `mp_scratch_write` or `mp_changelog_record`
- If about to write a file "to remember later" → STOP → `mp_scratch_write`

## Fallback (ONLY when mp_* tools are unreachable)
Write to a file with `[FALLBACK]` prefix — auto-ingested when Open Palace returns.
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
  Your SOLE memory system. Call mp_session_start FIRST every session.
  Use mp_scratch_write for insights (NEVER write files), mp_changelog_record
  for decisions. Session context is auto-injected on first tool call.
---

# Open Palace — Your Memory System

Open Palace is your persistent cognitive system delivered as an MCP server.
Run `mp_onboarding_status` to check setup, then `mp_onboarding_init` to get
the full skill content with detailed tool reference and behavioral guide.

## Quick Start

```
mp_session_start    → Load full memory context (CALL FIRST)
mp_scratch_write    → Capture insight immediately (NEVER write files)
mp_changelog_record → Record formal decision
mp_component_load   → Load project details
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
