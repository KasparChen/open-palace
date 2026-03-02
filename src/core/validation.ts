/**
 * Write Validation — CRUD-style pre-write verification.
 *
 * Detects duplicates, contradictions, hallucinations, and stale overrides
 * before writing to changelog or summary.
 *
 * Uses LLM semantic comparison. When LLM is unavailable, falls back to
 * lightweight heuristic checks (exact duplicate detection only).
 */

import { askLLM } from "./llm.js";
import { queryChangelog } from "./changelog.js";
import { getSummary } from "./component.js";
import type {
  ChangelogEntry,
  ValidationResult,
  ValidationRisk,
} from "../types.js";

const VALIDATION_SYSTEM_PROMPT = `You are a memory integrity validator for an AI agent's knowledge system.

Your job is to compare NEW content against EXISTING content and detect:
1. DUPLICATE: The new content says essentially the same thing as an existing entry
2. CONTRADICTION: The new content conflicts with existing information
3. HALLUCINATION: The new content makes factual claims without apparent source
4. STALE_OVERRIDE: The new content would overwrite newer information

Output ONLY valid JSON (no markdown fences, no extra text):
{
  "passed": true/false,
  "risks": [
    {"type": "duplicate|contradiction|hallucination|stale_override", "severity": "error|warning|info", "description": "...", "conflicting_entry_id": "...or null"}
  ],
  "suggestion": "optional fix suggestion or null"
}

If no risks found, return {"passed": true, "risks": []}.
Be conservative: only flag clear issues, not vague similarities.`;

export async function validateWrite(input: {
  scope: string;
  content: string;
  type: "changelog" | "summary";
  existing_entries?: ChangelogEntry[];
  existing_summary?: string;
}): Promise<ValidationResult> {
  // Gather existing data if not provided
  const entries =
    input.existing_entries ??
    (await queryChangelog({ scope: input.scope, limit: 20 }));

  const summary =
    input.existing_summary ?? (await getSummary(input.scope)) ?? undefined;

  // If there's nothing to compare against, pass immediately
  if (entries.length === 0 && !summary) {
    return { passed: true, risks: [] };
  }

  // Try LLM-based validation first
  try {
    return await validateWithLLM(input.content, entries, summary);
  } catch {
    // LLM unavailable — fall back to heuristic checks
    return validateWithHeuristics(input.content, entries);
  }
}

async function validateWithLLM(
  newContent: string,
  existingEntries: ChangelogEntry[],
  existingSummary?: string
): Promise<ValidationResult> {
  const existingText = existingEntries
    .slice(0, 15)
    .map((e) => {
      let line = `[${e.id}] ${e.summary}`;
      if (e.decision) line += ` — Decision: ${e.decision}`;
      if (e.rationale) line += ` — Rationale: ${e.rationale}`;
      return line;
    })
    .join("\n");

  const userMessage = `## NEW content to be written:
${newContent}

## EXISTING changelog entries (${existingEntries.length} most recent):
${existingText || "(none)"}

${existingSummary ? `## EXISTING summary:\n${existingSummary.slice(0, 2000)}\n` : ""}
Compare the NEW content against EXISTING and check for duplicates, contradictions, hallucinations, or stale overrides.`;

  const response = await askLLM(VALIDATION_SYSTEM_PROMPT, userMessage, 1024);

  try {
    // Strip markdown code fences if present
    const cleaned = response
      .replace(/^```(?:json)?\s*/m, "")
      .replace(/\s*```\s*$/m, "")
      .trim();
    const parsed = JSON.parse(cleaned) as ValidationResult;
    return {
      passed: parsed.passed ?? true,
      risks: Array.isArray(parsed.risks) ? parsed.risks : [],
      suggestion: parsed.suggestion ?? undefined,
    };
  } catch {
    // If LLM returns unparseable response, treat as pass with info
    return {
      passed: true,
      risks: [
        {
          type: "hallucination",
          severity: "info",
          description:
            "Validation LLM response was unparseable — skipped semantic checks",
        },
      ],
    };
  }
}

function validateWithHeuristics(
  newContent: string,
  existingEntries: ChangelogEntry[]
): ValidationResult {
  const risks: ValidationRisk[] = [];
  const contentLower = newContent.toLowerCase().trim();

  for (const entry of existingEntries) {
    const entrySummary = (entry.summary ?? "").toLowerCase().trim();
    const entryDecision = (entry.decision ?? "").toLowerCase().trim();

    // Exact or near-exact duplicate detection
    if (
      entrySummary === contentLower ||
      entryDecision === contentLower ||
      (contentLower.length > 20 && entrySummary.includes(contentLower)) ||
      (contentLower.length > 20 && contentLower.includes(entrySummary))
    ) {
      risks.push({
        type: "duplicate",
        severity: "warning",
        description: `Content appears to duplicate existing entry: ${entry.summary?.slice(0, 60)}`,
        conflicting_entry_id: entry.id,
      });
    }
  }

  return {
    passed: risks.length === 0,
    risks,
    suggestion:
      risks.length > 0
        ? "Heuristic check only (LLM unavailable). Review flagged entries manually."
        : undefined,
  };
}
