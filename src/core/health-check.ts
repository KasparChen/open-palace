/**
 * Health Check System — validates Open Palace data integrity.
 *
 * Checks:
 * 1. Index consistency: L0 entries ↔ actual component directories
 * 2. Orphan detection: directories without L0 entries (or vice versa)
 * 3. Staleness: changelog has entries but summary not updated
 * 4. Git status: uncommitted changes
 * 5. Entity sync: entity records ↔ SOUL.md files consistency
 */

import fs from "node:fs/promises";
import { paths } from "../utils/paths.js";
import { readMarkdown, readYaml } from "../utils/yaml.js";
import { getGit } from "./git.js";
import { registerSystem, type SystemRunResult } from "./system.js";
import type { ComponentType, ChangelogEntry } from "../types.js";

interface HealthIssue {
  severity: "error" | "warning" | "info";
  category: string;
  message: string;
  fix_suggestion?: string;
}

interface HealthReport {
  timestamp: string;
  issues: HealthIssue[];
  stats: {
    total_components: number;
    total_entities: number;
    index_entries: number;
    orphan_directories: number;
    orphan_index_entries: number;
    stale_summaries: number;
    uncommitted_changes: boolean;
  };
}

const TYPE_TAG_MAP: Record<string, string> = {
  projects: "P",
  knowledge: "K",
  skills: "C",
  relationships: "R",
};

async function discoverActualComponents(): Promise<Set<string>> {
  const types: ComponentType[] = [
    "projects",
    "knowledge",
    "skills",
    "relationships",
  ];
  const result = new Set<string>();

  for (const type of types) {
    const dir = `${paths.componentsDir()}/${type}`;
    try {
      const entries = await fs.readdir(dir);
      for (const entry of entries) {
        const stat = await fs.stat(`${dir}/${entry}`);
        if (stat.isDirectory()) {
          result.add(`${type}/${entry}`);
        }
      }
    } catch {
      // directory may not exist
    }
  }

  return result;
}

function parseIndexEntries(indexContent: string): Set<string> {
  const entries = new Set<string>();
  const lines = indexContent.split("\n");
  const tagToType: Record<string, string> = {
    P: "projects",
    K: "knowledge",
    C: "skills",
    R: "relationships",
  };

  for (const line of lines) {
    const match = line.match(/^\[([PKCRS])\]\s+(\S+)/);
    if (match) {
      const [, tag, key] = match;
      const type = tagToType[tag];
      if (type) {
        entries.add(`${type}/${key}`);
      }
    }
  }

  return entries;
}

async function runHealthCheck(): Promise<SystemRunResult> {
  const startTime = Date.now();
  const issues: HealthIssue[] = [];
  const stats: HealthReport["stats"] = {
    total_components: 0,
    total_entities: 0,
    index_entries: 0,
    orphan_directories: 0,
    orphan_index_entries: 0,
    stale_summaries: 0,
    uncommitted_changes: false,
  };

  // 1. Index consistency
  const indexContent =
    (await readMarkdown(paths.masterIndex())) ?? "";
  const indexEntries = parseIndexEntries(indexContent);
  const actualComponents = await discoverActualComponents();

  stats.index_entries = indexEntries.size;
  stats.total_components = actualComponents.size;

  // Orphan directories (exist on disk but not in index)
  for (const comp of actualComponents) {
    if (!indexEntries.has(comp)) {
      issues.push({
        severity: "warning",
        category: "orphan_directory",
        message: `Component directory "${comp}" exists but has no L0 index entry`,
        fix_suggestion: `Run mp_component_create or manually add entry to master.md`,
      });
      stats.orphan_directories++;
    }
  }

  // Orphan index entries (in index but no directory, excluding system entries)
  for (const entry of indexEntries) {
    if (!actualComponents.has(entry)) {
      issues.push({
        severity: "warning",
        category: "orphan_index",
        message: `L0 index entry "${entry}" has no matching component directory`,
        fix_suggestion: `Remove the orphan entry from index/master.md or create the component`,
      });
      stats.orphan_index_entries++;
    }
  }

  // 2. Staleness check
  for (const comp of actualComponents) {
    const [type, key] = comp.split("/");
    const changelogPath = paths.componentChangelog(type, key);
    const summaryPath = paths.componentSummary(type, key);

    const changelog = await readYaml<ChangelogEntry[]>(changelogPath);
    const summary = await readMarkdown(summaryPath);

    if (!summary || summary.trim() === "") {
      issues.push({
        severity: "error",
        category: "missing_summary",
        message: `Component "${comp}" has no summary.md`,
        fix_suggestion: `Run mp_summary_update to create a summary`,
      });
    }

    if (changelog && changelog.length > 0) {
      const latestEntry = changelog.reduce((latest, entry) =>
        new Date(entry.time) > new Date(latest.time) ? entry : latest
      );

      try {
        const summaryStats = await fs.stat(summaryPath);
        const lastChangelog = new Date(latestEntry.time);
        const lastSummary = new Date(summaryStats.mtime);

        if (lastChangelog > lastSummary) {
          issues.push({
            severity: "warning",
            category: "stale_summary",
            message: `Component "${comp}" has changelog entries newer than its summary (last changelog: ${latestEntry.time})`,
            fix_suggestion: `Run mp_system_execute with librarian digest to update`,
          });
          stats.stale_summaries++;
        }
      } catch {
        // summary file doesn't exist, already flagged above
      }
    }
  }

  // 3. Entity check
  try {
    const entityDir = paths.entitiesDir();
    const entityFiles = await fs.readdir(entityDir);
    stats.total_entities = entityFiles.filter((f) =>
      f.endsWith(".yaml")
    ).length;

    if (stats.total_entities === 0) {
      issues.push({
        severity: "info",
        category: "no_entities",
        message: "No entities registered in the system",
        fix_suggestion: "Use mp_entity_create to register agent identities",
      });
    }
  } catch {
    issues.push({
      severity: "error",
      category: "missing_directory",
      message: "Entities directory does not exist",
      fix_suggestion: "Re-run initialization",
    });
  }

  // 4. Git status
  try {
    const git = await getGit();
    const status = await git.status();
    stats.uncommitted_changes = !status.isClean();

    if (!status.isClean()) {
      issues.push({
        severity: "warning",
        category: "uncommitted_changes",
        message: `Git has uncommitted changes: ${status.modified.length} modified, ${status.not_added.length} untracked`,
        fix_suggestion:
          "This may indicate a PostHook failure. Changes should be auto-committed.",
      });
    }
  } catch {
    issues.push({
      severity: "error",
      category: "git_error",
      message: "Unable to check git status",
      fix_suggestion: "Verify that .git directory exists in ~/.open-palace/",
    });
  }

  // 5. Config validation
  try {
    const config = await readYaml<Record<string, unknown>>(paths.config());
    if (!config) {
      issues.push({
        severity: "error",
        category: "missing_config",
        message: "config.yaml is missing or unreadable",
        fix_suggestion: "Re-run initialization",
      });
    }
  } catch {
    issues.push({
      severity: "error",
      category: "config_error",
      message: "Error reading config.yaml",
    });
  }

  const hasErrors = issues.some((i) => i.severity === "error");
  const reportText = formatHealthReport({ timestamp: new Date().toISOString(), issues, stats });

  return {
    success: !hasErrors,
    message: `Health check complete: ${issues.length} issues found (${issues.filter((i) => i.severity === "error").length} errors, ${issues.filter((i) => i.severity === "warning").length} warnings)`,
    details: { report: reportText, stats, issues },
    duration_ms: Date.now() - startTime,
  };
}

function formatHealthReport(report: HealthReport): string {
  const lines: string[] = [
    `# Open Palace Health Report`,
    ``,
    `**Timestamp**: ${report.timestamp}`,
    ``,
    `## Stats`,
    `- Components: ${report.stats.total_components}`,
    `- Entities: ${report.stats.total_entities}`,
    `- Index entries: ${report.stats.index_entries}`,
    `- Orphan directories: ${report.stats.orphan_directories}`,
    `- Orphan index entries: ${report.stats.orphan_index_entries}`,
    `- Stale summaries: ${report.stats.stale_summaries}`,
    `- Uncommitted changes: ${report.stats.uncommitted_changes}`,
    ``,
  ];

  if (report.issues.length === 0) {
    lines.push(`## Status: ✅ All checks passed`);
  } else {
    lines.push(`## Issues (${report.issues.length})`);
    lines.push(``);

    for (const issue of report.issues) {
      const icon =
        issue.severity === "error"
          ? "❌"
          : issue.severity === "warning"
            ? "⚠️"
            : "ℹ️";
      lines.push(`${icon} **[${issue.category}]** ${issue.message}`);
      if (issue.fix_suggestion) {
        lines.push(`  → Fix: ${issue.fix_suggestion}`);
      }
    }
  }

  return lines.join("\n");
}

// ─── Registration ────────────────────────────────────────

export function registerHealthCheckSystem(): void {
  registerSystem({
    name: "health_check",
    description:
      "Index consistency, orphan detection, staleness check, git status",
    default_trigger: "cron",
    execute: async () => runHealthCheck(),
  });
}
