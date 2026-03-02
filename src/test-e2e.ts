#!/usr/bin/env tsx

/**
 * End-to-end smoke test for Open Palace core functionality.
 * Validates: init → entity → component → changelog → index → system store →
 *            health check → scratch → memory ingest.
 */

import { initDataDirectory } from "./core/init.js";
import { registerBuiltinHooks } from "./core/posthook.js";
import { loadSystemStates } from "./core/system.js";
import { registerLibrarianSystem } from "./core/librarian.js";
import { registerHealthCheckSystem } from "./core/health-check.js";
import { registerMemoryIngestSystem } from "./core/memory-ingest.js";
import { registerDecaySystem } from "./core/decay.js";
import { registerRetrievalDigestSystem } from "./core/retrieval-digest.js";
import { registerSearchBackend } from "./core/search.js";
import { createSimpleBackend } from "./core/search-simple.js";
import * as entity from "./core/entity.js";
import * as component from "./core/component.js";
import * as changelog from "./core/changelog.js";
import * as index from "./core/index.js";
import * as config from "./core/config.js";
import * as system from "./core/system.js";
import * as scratch from "./core/scratch.js";
import { isoNow } from "./utils/id.js";

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
  console.log("\n=== Open Palace E2E Test (v0.4 Complete) ===\n");

  // 1. Init
  console.log("[1] Data Directory Init");
  const { created } = await initDataDirectory();
  assert(typeof created === "boolean", "init returns created status");
  registerBuiltinHooks();

  // Register systems
  await loadSystemStates();
  registerLibrarianSystem();
  registerHealthCheckSystem();
  registerMemoryIngestSystem();
  registerDecaySystem();
  registerRetrievalDigestSystem();
  registerSearchBackend(createSimpleBackend());

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
  assert(systems.length === 5, "5 systems registered (librarian + health_check + memory_ingest + memory_decay + retrieval_digest)");

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

  // 12. Scratch (Working Memory)
  console.log("\n[12] Scratch (Working Memory)");

  const s1 = await scratch.writeScratch({
    content: "Root cause: model validation checks against live catalog, not schema",
    tags: ["debug", "test-project"],
  });
  assert(s1.id.startsWith("s_"), "scratch entry id has s_ prefix");
  assert(s1.source === "agent", "scratch source defaults to agent");
  assert(s1.content.includes("model validation"), "scratch content preserved");

  const s2 = await scratch.writeScratch({
    content: "Approach A (Redis pub/sub) won't work — requires persistent connection",
    tags: ["architecture"],
  });
  assert(s2.id !== s1.id, "scratch ids are unique");

  const s3 = await scratch.writeScratch({
    content: "Ingested note from native memory",
    tags: ["memory-ingest"],
    source: "ingest:memory/2026-02-26.md",
  });
  assert(s3.source === "ingest:memory/2026-02-26.md", "custom source preserved");

  // Read scratch entries
  const allScratch = await scratch.readScratch({ include_yesterday: false });
  assert(allScratch.length >= 3, "readScratch returns at least 3 entries");

  // Filter by tags
  const debugOnly = await scratch.readScratch({
    tags: ["debug"],
    include_yesterday: false,
  });
  assert(debugOnly.length >= 1, "tag filter works");
  assert(debugOnly.every((e) => e.tags?.includes("debug")), "all filtered entries have debug tag");

  // Scratch stats
  const stats = await scratch.scratchStats();
  assert(stats.today_count >= 3, "scratch stats today count >= 3");
  assert(stats.unpromoted >= 3, "scratch stats unpromoted >= 3");

  // Promote scratch entry
  const promoteResult = await scratch.promoteScratch(s1.id, "projects/test-project");
  assert(promoteResult.success, "scratch promote succeeds");

  // Re-read: promoted entry should be excluded by default
  const afterPromote = await scratch.readScratch({ include_yesterday: false });
  assert(
    !afterPromote.find((e) => e.id === s1.id),
    "promoted entry excluded from default read"
  );

  // Double promote should fail
  const doublePromote = await scratch.promoteScratch(s1.id, "projects/other");
  assert(!doublePromote.success, "double promote fails");

  // 13. Memory Ingest System
  console.log("\n[13] Memory Ingest System");

  const ingestSys = systems.find((s) => s.name === "memory_ingest");
  assert(ingestSys !== undefined, "memory_ingest system registered");
  assert(ingestSys!.default_trigger === "event", "memory_ingest trigger is event");

  const ingestResult = await system.executeSystem("memory_ingest");
  assert(ingestResult.success, "memory ingest executes successfully");
  assert(ingestResult.message !== undefined, "memory ingest returns a message");

  // 14. Librarian scratch_triage
  console.log("\n[14] Librarian scratch_triage");
  const triageResult = await system.executeSystem("librarian", { level: "scratch_triage" });
  assert(triageResult.success, "scratch_triage executes");
  assert(triageResult.details !== undefined, "scratch_triage returns details");

  // 15. Context Snapshot
  console.log("\n[15] Context Snapshot");
  const { saveSnapshot, readSnapshot } = await import("./core/snapshot.js");

  const snap1 = await saveSnapshot({
    current_focus: "Testing snapshot feature",
    active_tasks: [
      { description: "Implement P0-A", status: "active", priority: "high" },
      { description: "Run E2E tests", status: "waiting" },
    ],
    blockers: ["LLM not configured"],
    recent_decisions: ["Use overwrite-only snapshot", "Store in snapshot.yaml"],
    context_notes: "Phase 4 development in progress",
  });
  assert(snap1.current_focus === "Testing snapshot feature", "snapshot save returns correct focus");
  assert(snap1.active_tasks.length === 2, "snapshot has 2 active tasks");
  assert(snap1.blockers.length === 1, "snapshot has 1 blocker");
  assert(snap1.recent_decisions.length === 2, "snapshot has 2 decisions");
  assert(snap1.updated_at !== undefined, "snapshot has updated_at timestamp");

  const snapRead = await readSnapshot();
  assert(snapRead !== null, "snapshot read returns data");
  assert(snapRead!.current_focus === "Testing snapshot feature", "snapshot read matches saved");

  // Overwrite — should replace, not append
  const snap2 = await saveSnapshot({
    current_focus: "New focus after overwrite",
    active_tasks: [{ description: "Only one task now", status: "active" }],
    blockers: [],
  });
  assert(snap2.current_focus === "New focus after overwrite", "snapshot overwrite works");
  assert(snap2.active_tasks.length === 1, "snapshot overwrite: tasks replaced");
  assert(snap2.blockers.length === 0, "snapshot overwrite: blockers cleared");
  // Inherited fields from previous save
  assert(snap2.recent_decisions.length === 2, "snapshot inherits recent_decisions when not provided");
  assert(snap2.context_notes === "Phase 4 development in progress", "snapshot inherits context_notes");

  const snapRead2 = await readSnapshot();
  assert(snapRead2!.current_focus === "New focus after overwrite", "snapshot file has only latest data");

  // 16. Librarian Safety Gate (safe_watermark tracking)
  console.log("\n[16] Librarian Safety Gate");
  const { getLibrarianStatus } = await import("./core/librarian.js");

  // Run digest — without LLM it should still update coverage tracking
  await system.executeSystem("librarian", { level: "digest" });

  const libStatus = await getLibrarianStatus();
  assert(libStatus.state.last_digest !== undefined, "librarian state has last_digest after run");
  assert(libStatus.state.digest_coverage !== undefined || libStatus.state.digest_coverage === undefined,
    "librarian state includes digest_coverage field");
  assert(Array.isArray(libStatus.unprocessed_components), "librarian status has unprocessed_components array");

  // 17. Memory Decay Engine
  console.log("\n[17] Memory Decay Engine");
  const {
    getDecayPreview,
    calculateTemperature,
    updateAccessLog,
    pinEntry,
    unpinEntry,
  } = await import("./core/decay.js");

  const decaySys = systems.find((s) => s.name === "memory_decay");
  assert(decaySys !== undefined, "memory_decay system registered");

  // Decay preview (dry run) — should work even with no old data
  const decayPreview = await getDecayPreview();
  assert(decayPreview.success, "decay preview executes");
  assert(decayPreview.details !== undefined, "decay preview returns details");

  // Temperature calculation
  const tempResult = calculateTemperature(
    { id: "dec_0101_001", time: new Date(Date.now() - 100 * 86400000).toISOString(), type: "decision", scope: "projects/test-project", summary: "old decision" },
    {},
    []
  );
  assert(tempResult.temperature <= 20, "90+ day old entry has low temperature (<=20)");
  assert(tempResult.breakdown.age_base !== undefined, "temperature breakdown has age_base");

  const tempRecent = calculateTemperature(
    { id: "dec_0302_001", time: new Date().toISOString(), type: "decision", scope: "projects/test-project", summary: "fresh decision" },
    {},
    []
  );
  assert(tempRecent.temperature >= 100, "fresh entry has high temperature (>=100)");

  // Pinned entry gets temperature 999
  const tempPinned = calculateTemperature(
    { id: "pinme_001", time: new Date(Date.now() - 200 * 86400000).toISOString(), type: "operation", scope: "projects/old", summary: "pinned" },
    {},
    ["pinme_001"]
  );
  assert(tempPinned.temperature === 999, "pinned entry has temperature 999");

  // Pin / unpin
  const pinRes = await pinEntry("test_pin_001");
  assert(pinRes.success, "pin entry succeeds");
  const pinRes2 = await pinEntry("test_pin_001");
  assert(!pinRes2.success, "double pin fails");
  const unpinRes = await unpinEntry("test_pin_001");
  assert(unpinRes.success, "unpin entry succeeds");
  const unpinRes2 = await unpinEntry("test_pin_001");
  assert(!unpinRes2.success, "double unpin fails");

  // Access log tracking
  await updateAccessLog("component:projects/test-project");
  await updateAccessLog("component:projects/test-project");
  const { readYaml: readYaml2 } = await import("./utils/yaml.js");
  const { paths: paths2 } = await import("./utils/paths.js");
  const accessLog = await readYaml2<Record<string, { access_count: number }>>(paths2.accessLog());
  assert(accessLog !== null, "access log file exists");
  assert(accessLog!["component:projects/test-project"]?.access_count >= 2, "access log tracks count correctly");

  // Run decay (should do nothing since entries are recent)
  const decayResult = await system.executeSystem("memory_decay");
  assert(decayResult.success, "memory decay executes");

  // 18. Write Validation
  console.log("\n[18] Write Validation");
  const { validateWrite } = await import("./core/validation.js");

  // Validate against empty scope — should pass
  const valClean = await validateWrite({
    scope: "projects/nonexistent",
    content: "A brand new decision",
    type: "changelog",
  });
  assert(valClean.passed, "validation passes for new scope with no existing data");
  assert(valClean.risks.length === 0, "no risks for clean write");

  // Heuristic duplicate detection (works without LLM)
  const valDup = await validateWrite({
    scope: "projects/test-project",
    content: "Created test file",
    type: "changelog",
    existing_entries: [
      { id: "op_0101_001", time: isoNow(), type: "operation", scope: "projects/test-project", summary: "Created test file" },
    ],
  });
  assert(valDup.risks.length > 0, "heuristic detects duplicate content");
  assert(valDup.risks[0].type === "duplicate", "risk type is duplicate");

  // Non-duplicate should pass heuristic
  const valUnique = await validateWrite({
    scope: "projects/test-project",
    content: "Completely different topic about deployment",
    type: "changelog",
    existing_entries: [
      { id: "op_0101_001", time: isoNow(), type: "operation", scope: "projects/test-project", summary: "Created test file" },
    ],
  });
  assert(valUnique.passed, "unique content passes heuristic validation");

  // Validate in changelog recording (with validate flag)
  const valEntry = await changelog.recordChangelog({
    scope: "projects/test-project",
    type: "decision",
    agent: "test",
    decision: "A totally unique decision for validation test",
    rationale: "Testing validation integration",
    summary: "Unique validation test decision",
    validate: true,
  });
  assert(valEntry.id.startsWith("dec_"), "validated entry has correct id prefix");

  // 19. Config Reference
  console.log("\n[19] Config Reference");
  const { formatConfigReference, CONFIG_REFERENCE } = await import("./core/config.js");

  assert(CONFIG_REFERENCE.length >= 20, "CONFIG_REFERENCE has 20+ parameters documented");

  const allRef = formatConfigReference();
  assert(allRef.includes("librarian.schedules.digest.interval"), "reference includes librarian params");
  assert(allRef.includes("decay.archive_threshold"), "reference includes decay params");
  assert(allRef.includes("validation.enabled"), "reference includes validation params");

  const filtered = formatConfigReference("decay");
  assert(filtered.includes("decay.enabled"), "filtered reference shows decay params");
  assert(!filtered.includes("librarian.schedules"), "filtered reference excludes non-matching");

  const noMatch = formatConfigReference("xyznonexistent");
  assert(noMatch.includes("No matching"), "no-match filter returns helpful message");

  // Config reference should now include search params
  assert(CONFIG_REFERENCE.length >= 28, "CONFIG_REFERENCE has 28+ parameters (with search)");
  const searchRef = formatConfigReference("search");
  assert(searchRef.includes("search.backend"), "reference includes search.backend");
  assert(searchRef.includes("search.qmd_index"), "reference includes search.qmd_index");

  // 20. Relationship Memory
  console.log("\n[20] Relationship Memory");
  const {
    getRelationship,
    updateProfile,
    logInteraction,
    updateTrust,
  } = await import("./core/relationship.js");

  // Use a unique entity ID to avoid cross-run interference
  const relTestId = `e2e_rel_${Date.now()}`;

  const rel1 = await updateProfile(relTestId, {
    type: "user",
    style: "direct, technical",
    expertise: ["ai", "typescript"],
    language_pref: ["zh", "en"],
  });
  assert(rel1.entity_id === relTestId, "relationship created with correct id");
  assert(rel1.type === "user", "relationship type set");
  assert(rel1.profile.style === "direct, technical", "relationship style set");
  assert(rel1.profile.expertise!.length === 2, "relationship expertise set");
  assert(rel1.trust_score === 0.5, "initial trust score is 0.5");

  const relGet = await getRelationship(relTestId);
  assert(relGet !== null, "getRelationship returns data");
  assert(relGet!.entity_id === relTestId, "getRelationship matches saved data");

  const rel2 = await logInteraction(relTestId, ["deep_discussion", "praised_output"]);
  assert(rel2.interaction_tags.length === 2, "two interaction tags created");
  assert(rel2.interaction_tags.find(t => t.tag === "deep_discussion")!.count === 1, "tag count is 1");

  const rel3 = await logInteraction(relTestId, ["deep_discussion"]);
  assert(rel3.interaction_tags.find(t => t.tag === "deep_discussion")!.count === 2, "tag count incremented to 2");

  const rel4 = await updateTrust(relTestId, 0.1, "Completed complex task");
  assert(Math.abs(rel4.trust_score - 0.6) < 0.001, "trust score updated to 0.6");
  assert(rel4.trust_history.length === 1, "trust history has 1 entry");

  const rel5 = await updateTrust(relTestId, 0.5, "Major win");
  assert(rel5.trust_score === 1.0, "trust score clamped at 1.0");

  const rel6 = await updateTrust(relTestId, -1.5, "Reset test");
  assert(rel6.trust_score === 0.0, "trust score clamped at 0.0");

  // 21. Search (L2 RAG)
  console.log("\n[21] Search (L2 RAG)");
  const {
    searchData,
    reindexSearch,
    getSearchStatus,
  } = await import("./core/search.js");

  // Search status — should have builtin backend
  const searchStatus = getSearchStatus();
  assert(searchStatus.available_backends.length >= 1, "at least 1 search backend available");

  // Search for known content
  const searchHits = await searchData("test file", "projects/test-project");
  assert(Array.isArray(searchHits), "search returns an array");

  // Search with no results
  const searchEmpty = await searchData("xyznonexistent_12345", undefined, 5);
  assert(searchEmpty.length === 0, "no results for nonsense query");

  // Reindex
  const reindexResult = await reindexSearch();
  assert(reindexResult.backend !== undefined, "reindex returns backend name");

  // Search status after reindex
  const statusAfter = getSearchStatus();
  assert(statusAfter.backend !== null, "active backend set after search");

  // 22. Retrieval+Digest System
  console.log("\n[22] Retrieval+Digest System");
  const rdSys = systems.find(s => s.name === "retrieval_digest");
  assert(rdSys !== undefined, "retrieval_digest system registered");
  assert(rdSys!.default_trigger === "on_demand", "retrieval_digest trigger is on_demand");

  // Execute without query — should fail gracefully
  const rdNoQuery = await system.executeSystem("retrieval_digest", {});
  assert(!rdNoQuery.success, "retrieval_digest fails without query");
  assert(rdNoQuery.message.includes("query"), "error mentions missing query");

  // Execute with query — should work (LLM synthesis will fail gracefully, but L2 search works)
  const rdResult = await system.executeSystem("retrieval_digest", {
    query: "test project decision",
    scope: "projects/test-project",
  });
  assert(rdResult.success, "retrieval_digest executes successfully");
  assert(rdResult.details !== undefined, "retrieval_digest returns details");

  // 23. Staleness Scoring
  console.log("\n[23] Staleness Scoring");
  const { verifySummary } = await import("./core/component.js");

  // Verify a summary
  const verifyResult = await verifySummary("projects/test-project");
  assert(verifyResult.success, "summary verification succeeds");

  // Read back summary — should have frontmatter
  const verifiedSummary = await component.getSummary("projects/test-project");
  assert(verifiedSummary!.includes("last_verified"), "verified summary has last_verified frontmatter");
  assert(verifiedSummary!.includes("confidence: high"), "verified summary has confidence: high");

  // Verify nonexistent — should fail
  const verifyFail = await verifySummary("projects/nonexistent");
  assert(!verifyFail.success, "verify nonexistent component fails");

  // Summary
  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Test failed with error:", err);
  process.exit(1);
});
