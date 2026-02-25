/**
 * Librarian — the "librarian" of Open Palace.
 *
 * Three-layer summarization system:
 *   Digest (daily)    — incremental changelog → L1 summary updates
 *   Synthesis (weekly) — cross-component correlation → weekly report
 *   Review (monthly)   — full L0 rebuild + monthly report + cleanup
 */

import fs from "node:fs/promises";
import { paths } from "../utils/paths.js";
import { readYaml, writeYaml, readMarkdown, writeMarkdown } from "../utils/yaml.js";
import { askLLM } from "./llm.js";
import { getMasterIndex } from "./index.js";
import { gitCommit } from "./git.js";
import { isoNow, yearMonth } from "../utils/id.js";
import { registerSystem, type SystemRunResult } from "./system.js";
import type { ChangelogEntry, ComponentType } from "../types.js";

// ─── State tracking ──────────────────────────────────────

interface LibrarianState {
  last_digest?: string;
  last_synthesis?: string;
  last_review?: string;
}

async function getLibrarianState(): Promise<LibrarianState> {
  const data = await readYaml<LibrarianState>(
    `${paths.root()}/librarian-state.yaml`
  );
  return data ?? {};
}

async function saveLibrarianState(state: LibrarianState): Promise<void> {
  await writeYaml(`${paths.root()}/librarian-state.yaml`, state);
}

// ─── Component discovery ─────────────────────────────────

interface ComponentInfo {
  type: ComponentType;
  key: string;
  fullKey: string;
  summaryPath: string;
  changelogPath: string;
}

async function discoverComponents(): Promise<ComponentInfo[]> {
  const types: ComponentType[] = [
    "projects",
    "knowledge",
    "skills",
    "relationships",
  ];
  const result: ComponentInfo[] = [];

  for (const type of types) {
    const dir = `${paths.componentsDir()}/${type}`;
    try {
      const entries = await fs.readdir(dir);
      for (const entry of entries) {
        const stat = await fs.stat(`${dir}/${entry}`);
        if (stat.isDirectory()) {
          result.push({
            type,
            key: entry,
            fullKey: `${type}/${entry}`,
            summaryPath: paths.componentSummary(type, entry),
            changelogPath: paths.componentChangelog(type, entry),
          });
        }
      }
    } catch {
      // directory may not exist
    }
  }

  return result;
}

function filterNewEntries(
  entries: ChangelogEntry[],
  since?: string
): ChangelogEntry[] {
  if (!since) return entries;
  const sinceDate = new Date(since);
  return entries.filter((e) => new Date(e.time) > sinceDate);
}

// ─── Digest (Layer 1) ────────────────────────────────────

const DIGEST_SYSTEM_PROMPT = `You are the Librarian of a knowledge management system called Open Palace.
Your job is to update component summaries based on new changelog entries.

Rules:
- Output ONLY the updated summary in Markdown format
- Preserve the existing structure and important historical information
- Integrate new information naturally, don't just append
- Keep summaries concise but comprehensive (500-1500 words max)
- Use structured Markdown: headings, bullet points, key-value pairs
- Highlight status changes, blockers, and key decisions
- Write in the same language as the existing content (default: Chinese)`;

async function runDigest(
  scope?: string
): Promise<SystemRunResult> {
  const startTime = Date.now();
  const state = await getLibrarianState();
  const components = await discoverComponents();

  const targetComponents = scope
    ? components.filter((c) => c.fullKey === scope)
    : components;

  if (targetComponents.length === 0) {
    return {
      success: true,
      message: scope
        ? `No component found: ${scope}`
        : "No components to digest",
      duration_ms: Date.now() - startTime,
    };
  }

  let updatedCount = 0;
  const errors: string[] = [];

  for (const comp of targetComponents) {
    try {
      const changelog = await readYaml<ChangelogEntry[]>(comp.changelogPath);
      if (!changelog || changelog.length === 0) continue;

      const newEntries = filterNewEntries(changelog, state.last_digest);
      if (newEntries.length === 0) continue;

      const currentSummary =
        (await readMarkdown(comp.summaryPath)) ?? `# ${comp.key}\n\n(empty)\n`;

      const changelogText = newEntries
        .map((e) => {
          let line = `- [${e.type}] ${e.summary}`;
          if (e.decision) line += ` | Decision: ${e.decision}`;
          if (e.rationale) line += ` | Rationale: ${e.rationale}`;
          if (e.alternatives?.length) {
            line += ` | Alternatives: ${e.alternatives
              .map((a) => `${a.option} (rejected: ${a.rejected_because})`)
              .join("; ")}`;
          }
          return line;
        })
        .join("\n");

      const userMessage = `## Component: ${comp.fullKey}

### Current Summary:
${currentSummary}

### New Changelog Entries (${newEntries.length} entries since last digest):
${changelogText}

Please output the updated summary for this component.`;

      try {
        const updatedSummary = await askLLM(
          DIGEST_SYSTEM_PROMPT,
          userMessage,
          2048
        );
        await writeMarkdown(comp.summaryPath, updatedSummary);
        updatedCount++;
      } catch (llmErr) {
        errors.push(
          `${comp.fullKey} (LLM): ${llmErr instanceof Error ? llmErr.message : String(llmErr)}`
        );
      }
    } catch (err) {
      errors.push(
        `${comp.fullKey}: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  state.last_digest = isoNow();
  await saveLibrarianState(state);

  const dateStr = new Date().toISOString().slice(0, 10);
  await gitCommit(`librarian: daily digest ${dateStr}`);

  return {
    success: errors.length === 0,
    message: `Digest complete: ${updatedCount} components updated${
      errors.length > 0 ? `, ${errors.length} errors` : ""
    }`,
    details: { updated: updatedCount, errors },
    duration_ms: Date.now() - startTime,
  };
}

// ─── Synthesis (Layer 2) ─────────────────────────────────

const SYNTHESIS_SYSTEM_PROMPT = `You are the Librarian performing weekly synthesis for Open Palace.
Your job is to analyze cross-component correlations and generate a weekly summary.

Rules:
- Identify dependencies and influences between components
- Highlight patterns: common problems, shared blockers, synergies
- Note status changes across the portfolio
- Provide actionable insights and recommendations
- Output in structured Markdown with clear sections
- Write in the same language as the input (default: Chinese)`;

async function runSynthesis(): Promise<SystemRunResult> {
  const startTime = Date.now();
  const state = await getLibrarianState();
  const components = await discoverComponents();

  const summaries: string[] = [];
  for (const comp of components) {
    const summary = await readMarkdown(comp.summaryPath);
    if (summary) {
      summaries.push(`## ${comp.fullKey}\n${summary}`);
    }
  }

  if (summaries.length === 0) {
    return {
      success: true,
      message: "No component summaries available for synthesis",
      duration_ms: Date.now() - startTime,
    };
  }

  const globalChangelogPath = paths.globalChangelog(yearMonth());
  const globalEntries =
    (await readYaml<ChangelogEntry[]>(globalChangelogPath)) ?? [];
  const recentGlobal = filterNewEntries(globalEntries, state.last_synthesis);

  const globalText =
    recentGlobal.length > 0
      ? recentGlobal
          .map((e) => `- [${e.type}] ${e.scope}: ${e.summary}`)
          .join("\n")
      : "(No new global entries)";

  const masterIndex = await getMasterIndex();

  const userMessage = `## Current Master Index (L0):
${masterIndex}

## Component Summaries (${summaries.length} components):
${summaries.join("\n\n---\n\n")}

## Recent Global Changelog:
${globalText}

Please generate a weekly synthesis report analyzing:
1. Cross-component correlations and dependencies
2. Status overview and progress trends
3. Common patterns or shared blockers
4. Recommendations and action items`;

  let report: string;
  try {
    report = await askLLM(SYNTHESIS_SYSTEM_PROMPT, userMessage, 4096);
  } catch (err) {
    return {
      success: false,
      message: `Synthesis LLM call failed: ${err instanceof Error ? err.message : String(err)}`,
      duration_ms: Date.now() - startTime,
    };
  }

  const now = new Date();
  const weekNum = getISOWeek(now);
  const year = now.getFullYear();
  const weeklyPath = `${paths.weeklyDir()}/${year}-W${String(weekNum).padStart(2, "0")}.md`;
  await writeMarkdown(weeklyPath, report);

  state.last_synthesis = isoNow();
  await saveLibrarianState(state);

  const dateStr = now.toISOString().slice(0, 10);
  await gitCommit(`librarian: weekly synthesis ${dateStr}`);

  return {
    success: true,
    message: `Synthesis complete: weekly report generated at ${weeklyPath}`,
    details: { components_analyzed: summaries.length, report_path: weeklyPath },
    duration_ms: Date.now() - startTime,
  };
}

// ─── Review (Layer 3) ────────────────────────────────────

const REVIEW_SYSTEM_PROMPT = `You are the Librarian performing a monthly review for Open Palace.
Your job is to rebuild the L0 Master Index and generate a monthly review report.

For the Master Index, use this EXACT compressed format:
[TAG] key | status | ⟳MMDD | →focus | ⚑blocker

Where TAG is: [P]=Project [K]=Knowledge [S]=System [C]=Component [R]=Relationship
Status: ★=active ○=paused ●=done ✕=blocked

Rules for the Master Index:
- One line per component/system
- Keep it under 500 tokens total
- Information density over readability
- Include the legend as a comment at the end

For the Monthly Report:
- High-level trend analysis
- Resource allocation insights
- Key achievements and blockers
- Recommendations for next month
- Write in the same language as the input (default: Chinese)`;

async function runReview(): Promise<SystemRunResult> {
  const startTime = Date.now();
  const components = await discoverComponents();

  const summaries: string[] = [];
  for (const comp of components) {
    const summary = await readMarkdown(comp.summaryPath);
    if (summary) {
      summaries.push(`## ${comp.fullKey}\n${summary}`);
    }
  }

  // Collect weekly reports for this month
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  let weeklyReports = "";
  try {
    const weeklyFiles = await fs.readdir(paths.weeklyDir());
    const thisMonthFiles = weeklyFiles.filter((f) =>
      f.startsWith(`${year}-W`)
    );
    for (const file of thisMonthFiles.slice(-5)) {
      const content = await readMarkdown(`${paths.weeklyDir()}/${file}`);
      if (content) {
        weeklyReports += `### ${file}\n${content}\n\n`;
      }
    }
  } catch {
    // no weekly reports yet
  }

  const masterIndex = await getMasterIndex();

  const userMessage = `## Current Master Index (L0):
${masterIndex}

## All Component Summaries (${summaries.length} components):
${summaries.join("\n\n---\n\n")}

## Weekly Reports This Month:
${weeklyReports || "(No weekly reports)"}

Please generate TWO outputs separated by "===SEPARATOR===":

1. FIRST: The rebuilt L0 Master Index (complete rebuild, not incremental).
   Wrap it in a Markdown code block inside the document.
   Include system entries for librarian and health_check.

2. SECOND: A monthly review report with:
   - Trend analysis
   - Key achievements
   - Blockers and risks
   - Recommendations`;

  let response: string;
  try {
    response = await askLLM(REVIEW_SYSTEM_PROMPT, userMessage, 6144);
  } catch (err) {
    return {
      success: false,
      message: `Review LLM call failed: ${err instanceof Error ? err.message : String(err)}`,
      duration_ms: Date.now() - startTime,
    };
  }

  const [indexPart, reportPart] = response.split("===SEPARATOR===");

  if (indexPart && indexPart.trim().length > 0) {
    const rebuiltIndex = `# Open Palace — Master Index (L0)\n\n> Auto-generated by Librarian monthly review.\n\n${indexPart.trim()}\n`;
    await writeMarkdown(paths.masterIndex(), rebuiltIndex);
  }

  const monthlyPath = `${paths.monthlyDir()}/${year}-${month}.md`;
  if (reportPart && reportPart.trim().length > 0) {
    await writeMarkdown(monthlyPath, reportPart.trim());
  } else {
    await writeMarkdown(monthlyPath, response);
  }

  const state = await getLibrarianState();
  state.last_review = isoNow();
  await saveLibrarianState(state);

  const dateStr = now.toISOString().slice(0, 10);
  await gitCommit(`librarian: monthly review ${dateStr}`);

  return {
    success: true,
    message: `Review complete: L0 rebuilt, monthly report at ${monthlyPath}`,
    details: {
      components_reviewed: summaries.length,
      report_path: monthlyPath,
    },
    duration_ms: Date.now() - startTime,
  };
}

// ─── Registration ────────────────────────────────────────

export function registerLibrarianSystem(): void {
  registerSystem({
    name: "librarian",
    description:
      "Layered summarization: digest (daily) → synthesis (weekly) → review (monthly)",
    default_trigger: "cron",
    execute: async (params) => {
      const level = (params?.level as string) ?? "digest";
      const scope = params?.scope as string | undefined;

      switch (level) {
        case "digest":
          return runDigest(scope);
        case "synthesis":
          return runSynthesis();
        case "review":
          return runReview();
        default:
          return {
            success: false,
            message: `Unknown librarian level: ${level}. Use: digest, synthesis, review`,
            duration_ms: 0,
          };
      }
    },
  });
}

// ─── Helpers ─────────────────────────────────────────────

function getISOWeek(date: Date): number {
  const d = new Date(date.getTime());
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const week1 = new Date(d.getFullYear(), 0, 4);
  return (
    1 +
    Math.round(
      ((d.getTime() - week1.getTime()) / 86400000 -
        3 +
        ((week1.getDay() + 6) % 7)) /
        7
    )
  );
}
