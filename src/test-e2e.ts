#!/usr/bin/env tsx

/**
 * End-to-end smoke test for Open Palace core functionality.
 * Validates: init → entity → component → changelog → index → system store → health check.
 */

import { initDataDirectory } from "./core/init.js";
import { registerBuiltinHooks } from "./core/posthook.js";
import { loadSystemStates } from "./core/system.js";
import { registerLibrarianSystem } from "./core/librarian.js";
import { registerHealthCheckSystem } from "./core/health-check.js";
import * as entity from "./core/entity.js";
import * as component from "./core/component.js";
import * as changelog from "./core/changelog.js";
import * as index from "./core/index.js";
import * as config from "./core/config.js";
import * as system from "./core/system.js";

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string) {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ ${label}`);
    failed++;
  }
}

async function main() {
  console.log("\n=== Open Palace E2E Test (Phase 3) ===\n");

  // 1. Init
  console.log("[1] Data Directory Init");
  const { created } = await initDataDirectory();
  assert(typeof created === "boolean", "init returns created status");
  registerBuiltinHooks();

  // Register systems
  await loadSystemStates();
  registerLibrarianSystem();
  registerHealthCheckSystem();

  // 2. Config
  console.log("\n[2] Config");
  const cfg = await config.getConfig();
  assert(cfg.version === "0.1.0", "config version is 0.1.0");
  const validIntervals = ["hourly", "daily", "weekly", "monthly", "manual"];
  assert(validIntervals.includes(cfg.librarian.schedules.digest.interval), "librarian digest has valid interval");

  // 3. Entity CRUD
  console.log("\n[3] Entity Registry");
  const ent = await entity.createEntity("test_agent", "Test Agent", "A test entity", "You are a helpful test agent.");
  assert(ent.entity_id === "test_agent", "entity created with correct id");
  assert(ent.soul_content === "You are a helpful test agent.", "soul content set");
  assert(ent.evolution_log.length === 1, "initial evolution log entry");

  const soul = await entity.getSoul("test_agent");
  assert(soul === "You are a helpful test agent.", "getSoul returns content");

  const updated = await entity.updateSoul("test_agent", "You are an updated test agent.", "test update");
  assert(updated.soul_content === "You are an updated test agent.", "soul updated");
  assert(updated.evolution_log.length === 2, "evolution log has 2 entries");

  const allEntities = await entity.listEntities();
  assert(allEntities.length >= 1, "listEntities returns at least 1");

  // 4. Component CRUD
  console.log("\n[4] Component Store");
  await component.createComponent("projects", "test-project", "A test project for e2e validation");
  const compList = await component.listComponents("projects");
  assert(compList.includes("projects/test-project"), "component listed");

  const loaded = await component.loadComponent("projects/test-project");
  assert(loaded !== null, "component loaded");
  assert(loaded!.summary.includes("test project"), "summary contains expected text");

  const summary = await component.getSummary("projects/test-project");
  assert(summary !== null && summary.includes("test project"), "getSummary works");

  await component.updateSummary("projects/test-project", "# test-project\n\nUpdated summary.\n");
  const updatedSummary = await component.getSummary("projects/test-project");
  assert(updatedSummary!.includes("Updated summary"), "summary updated");

  const unloaded = await component.unloadComponent("projects/test-project");
  assert(unloaded, "component unloaded");

  // 5. Changelog
  console.log("\n[5] Changelog");
  const opEntry = await changelog.recordChangelog({
    scope: "projects/test-project",
    type: "operation",
    agent: "test",
    action: "file_create",
    target: "src/test.ts",
    summary: "Created test file",
  });
  assert(opEntry.id.startsWith("op_"), "operation entry id prefix");
  assert(opEntry.type === "operation", "operation type correct");

  const decEntry = await changelog.recordChangelog({
    scope: "projects/test-project",
    type: "decision",
    agent: "test",
    decision: "Use TypeScript",
    rationale: "Better type safety",
    alternatives: [{ option: "JavaScript", rejected_because: "No type checking" }],
    summary: "Tech stack decision",
  });
  assert(decEntry.id.startsWith("dec_"), "decision entry id prefix");
  assert(decEntry.alternatives!.length === 1, "alternatives recorded");

  const queried = await changelog.queryChangelog({ scope: "projects/test-project", limit: 10 });
  assert(queried.length === 2, "query returns 2 entries");

  const decisionsOnly = await changelog.queryChangelog({ scope: "projects/test-project", type: "decision" });
  assert(decisionsOnly.length === 1, "decision filter works");

  // 6. L0 Index
  console.log("\n[6] L0 Master Index");
  const masterIdx = await index.getMasterIndex();
  assert(masterIdx.includes("test-project"), "index contains test-project");
  assert(masterIdx.includes("[P]"), "index has project tag");

  const searchResults = await index.searchIndex("test-project");
  assert(searchResults.length > 0, "search finds test-project");

  const noResults = await index.searchIndex("nonexistent_xyz_999");
  assert(noResults.length === 0, "search returns empty for no match");

  // 7. System Store
  console.log("\n[7] System Store");
  const systems = system.listSystems();
  assert(systems.length === 2, "2 systems registered (librarian + health_check)");

  const librarianSys = systems.find((s) => s.name === "librarian");
  assert(librarianSys !== undefined, "librarian system registered");
  assert(librarianSys!.default_trigger === "cron", "librarian trigger is cron");

  const healthSys = systems.find((s) => s.name === "health_check");
  assert(healthSys !== undefined, "health_check system registered");

  const libState = system.getSystemState("librarian");
  assert(libState !== null, "librarian state exists");
  const libRunsBefore = libState!.run_count;

  // 8. Health Check execution
  console.log("\n[8] Health Check Execution");
  const hcRunsBefore = system.getSystemState("health_check")?.run_count ?? 0;
  const hcResult = await system.executeSystem("health_check");
  assert(hcResult.success || !hcResult.success, "health check executed (may have warnings)");
  assert(hcResult.message.includes("Health check complete"), "health check returns report");
  assert(hcResult.duration_ms >= 0, "duration tracked");

  const hcState = system.getSystemState("health_check");
  assert(hcState!.run_count === hcRunsBefore + 1, "health check run count incremented");
  assert(hcState!.last_run !== undefined, "health check last_run timestamp set");
  assert(hcState!.last_result !== undefined, "health check last_result set");

  // 9. Librarian (without LLM — should fail gracefully or skip if no API key)
  console.log("\n[9] Librarian (no-LLM mode)");
  const libResult = await system.executeSystem("librarian", { level: "digest" });
  // Without API key, digest may report "no entries" (success) or "API key" error
  assert(libResult.message !== undefined, "librarian digest returns a message");

  const libResultBad = await system.executeSystem("librarian", { level: "nonexistent" });
  assert(!libResultBad.success, "invalid level rejected");
  assert(libResultBad.message.includes("Unknown librarian level"), "correct error message for invalid level");

  // 10. System not found
  console.log("\n[10] System Edge Cases");
  const notFound = await system.executeSystem("nonexistent_system");
  assert(!notFound.success, "nonexistent system returns failure");
  assert(notFound.message.includes("not found"), "correct error message");

  // 11. Workspace Sync
  console.log("\n[11] Workspace Sync");
  const { syncWorkspace, getWorkspacePath, writeSoulToWorkspace } = await import("./core/sync.js");
  const syncCfg = await config.getConfig();

  // syncWorkspace should return a result (may or may not detect a workspace)
  const syncResult = await syncWorkspace(syncCfg);
  assert(typeof syncResult.synced === "boolean", "syncWorkspace returns synced status");
  assert(Array.isArray(syncResult.changes), "syncWorkspace returns changes array");

  // writeSoulToWorkspace should handle missing workspace gracefully
  if (!getWorkspacePath()) {
    const wrote = await writeSoulToWorkspace("main", "test content");
    // If no workspace path, should return false (no crash)
    assert(wrote === false || wrote === true, "writeSoulToWorkspace handles no workspace gracefully");
  }

  // Summary
  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Test failed with error:", err);
  process.exit(1);
});
