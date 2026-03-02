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
import { registerMemoryIngestSystem, runMemoryIngest } from "./core/memory-ingest.js";
import { registerDecaySystem } from "./core/decay.js";
import { registerRetrievalDigestSystem } from "./core/retrieval-digest.js";
import { registerSearchBackend } from "./core/search.js";
import { createQmdBackend } from "./core/search-qmd.js";
import { createOramaBackend } from "./core/search-orama.js";
import { createSimpleBackend } from "./core/search-simple.js";
import { setServerRef } from "./core/llm.js";

import { registerEntityTools } from "./tools/entity-tools.js";
import { registerIndexTools } from "./tools/index-tools.js";
import { registerComponentTools } from "./tools/component-tools.js";
import { registerChangelogTools } from "./tools/changelog-tools.js";
import { registerConfigTools } from "./tools/config-tools.js";
import { registerSystemTools } from "./tools/system-tools.js";
import { registerOnboardingTools } from "./tools/onboarding-tools.js";
import { registerScratchTools } from "./tools/scratch-tools.js";
import { registerSnapshotTools } from "./tools/snapshot-tools.js";
import { registerDecayTools } from "./tools/decay-tools.js";
import { registerValidationTools } from "./tools/validation-tools.js";
import { registerRelationshipTools } from "./tools/relationship-tools.js";
import { registerSearchTools } from "./tools/search-tools.js";
import { registerStalenessTools } from "./tools/staleness-tools.js";

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
  registerMemoryIngestSystem();
  registerDecaySystem();
  registerRetrievalDigestSystem();

  // Register search backends (priority order: QMD > Orama > Simple)
  registerSearchBackend(createQmdBackend());
  registerSearchBackend(createOramaBackend());
  registerSearchBackend(createSimpleBackend());

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
  registerScratchTools(server);
  registerSnapshotTools(server);
  registerDecayTools(server);
  registerValidationTools(server);
  registerRelationshipTools(server);
  registerSearchTools(server);
  registerStalenessTools(server);

  // Run memory ingest on startup (lightweight SHA256 diff, non-blocking)
  try {
    const ingestResult = await runMemoryIngest();
    if (ingestResult.files_ingested > 0) {
      console.error(
        `[open-palace] Ingested ${ingestResult.files_ingested} memory file(s) → ${ingestResult.entries_created} scratch entries`
      );
    }
  } catch {
    // Ingest failure is non-fatal
  }

  // Connect via stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error("[open-palace] MCP Server running (stdio transport)");
}

main().catch((err) => {
  console.error("[open-palace] Fatal error:", err);
  process.exit(1);
});
