#!/usr/bin/env node

/**
 * Open Palace — MCP Server Entry Point
 *
 * A storage-compute separated Agent memory system.
 * Runs locally via stdio transport; data lives in ~/.open-palace/.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { initDataDirectory } from "./core/init.js";
import { registerBuiltinHooks } from "./core/posthook.js";
import { loadSystemStates } from "./core/system.js";
import { registerLibrarianSystem } from "./core/librarian.js";
import { registerHealthCheckSystem } from "./core/health-check.js";
import { setServerRef } from "./core/llm.js";

import { registerEntityTools } from "./tools/entity-tools.js";
import { registerIndexTools } from "./tools/index-tools.js";
import { registerComponentTools } from "./tools/component-tools.js";
import { registerChangelogTools } from "./tools/changelog-tools.js";
import { registerConfigTools } from "./tools/config-tools.js";
import { registerSystemTools } from "./tools/system-tools.js";
import { registerOnboardingTools } from "./tools/onboarding-tools.js";

async function main() {
  // Initialize data directory and git repo
  const { created } = await initDataDirectory();
  if (created) {
    console.error("[open-palace] Initialized data directory at ~/.open-palace/");
  }

  // Register PostHook auto-commit handlers
  registerBuiltinHooks();

  // Load system states and register executable systems
  await loadSystemStates();
  registerLibrarianSystem();
  registerHealthCheckSystem();

  // Create MCP server
  const server = new McpServer({
    name: "open-palace",
    version: "0.1.0",
  });

  // Pass low-level Server ref to LLM module for MCP Sampling support
  setServerRef(server.server);

  // Register all tool groups
  registerEntityTools(server);
  registerIndexTools(server);
  registerComponentTools(server);
  registerChangelogTools(server);
  registerConfigTools(server);
  registerSystemTools(server);
  registerOnboardingTools(server);

  // Connect via stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error("[open-palace] MCP Server running (stdio transport)");
}

main().catch((err) => {
  console.error("[open-palace] Fatal error:", err);
  process.exit(1);
});
