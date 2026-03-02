/**
 * Retrieval+Digest System — progressive unpacking search pipeline.
 *
 * L0 match → L1 summary load → L2 raw search → LLM synthesis.
 * Registered as a System, invoked via mp_system_execute("retrieval_digest").
 */

import { searchIndex } from "./index.js";
import { getSummary } from "./component.js";
import { listComponents } from "./component.js";
import { searchData } from "./search.js";
import { askLLM } from "./llm.js";
import { registerSystem, type SystemRunResult } from "./system.js";

const DIGEST_PROMPT = `You are a knowledge retrieval assistant for Open Palace, a structured memory system.

Given a user query, relevant component summaries, and raw search results, synthesize a concise, accurate answer.

Rules:
- Cite specific entry IDs or component names when referencing information
- Distinguish between confirmed facts (from changelogs/decisions) and summaries
- If information is insufficient, say so explicitly
- Write in the same language as the query
- Keep response structured with clear sections`;

async function runRetrievalDigest(
  params?: Record<string, unknown>
): Promise<SystemRunResult> {
  const startTime = Date.now();
  const query = params?.query as string;
  const scope = params?.scope as string | undefined;

  if (!query) {
    return {
      success: false,
      message: "Missing required parameter: query",
      duration_ms: 0,
    };
  }

  // Step 1: L0 match — find relevant components from master index
  const indexMatches = await searchIndex(query);
  let relevantComponents: string[];
  if (scope) {
    relevantComponents = [scope];
  } else {
    // Extract component keys from index match lines like "[P] my-project | ..."
    const allComponents = await listComponents();
    relevantComponents = allComponents.filter((compKey) =>
      indexMatches.some((line) => line.includes(compKey.split("/")[1]))
    ).slice(0, 5);
    // If no L0 match, use first few components as fallback
    if (relevantComponents.length === 0) {
      relevantComponents = allComponents.slice(0, 3);
    }
  }

  // Step 2: L1 load — read summaries of matched components
  const summaries: string[] = [];
  for (const compKey of relevantComponents) {
    const summary = await getSummary(compKey);
    if (summary) {
      summaries.push(`## ${compKey}\n${summary.slice(0, 2000)}`);
    }
  }

  // Step 3: L2 search — raw data retrieval
  const rawResults = await searchData(query, scope, 15);

  if (summaries.length === 0 && rawResults.length === 0) {
    return {
      success: true,
      message: "No relevant data found for the query",
      details: {
        query,
        scope,
        components_checked: relevantComponents.length,
        raw_results: 0,
      },
      duration_ms: Date.now() - startTime,
    };
  }

  // Step 4: LLM synthesis
  const rawText = rawResults
    .map((r) => `[${r.id}] (${r.source}, score:${r.score.toFixed(2)}) ${r.content}`)
    .join("\n");

  const userMessage = `## Query
${query}
${scope ? `\nScope: ${scope}` : ""}

## Component Summaries (L1)
${summaries.length > 0 ? summaries.join("\n\n---\n\n") : "(No matching summaries)"}

## Raw Search Results (L2, ${rawResults.length} results)
${rawText || "(No raw results)"}

Synthesize a comprehensive answer to the query based on the above context.`;

  let digest: string;
  try {
    digest = await askLLM(DIGEST_PROMPT, userMessage, 2048);
  } catch (err) {
    // LLM unavailable — return raw results without synthesis
    return {
      success: true,
      message: `Found ${rawResults.length} results (LLM unavailable for synthesis)`,
      details: {
        query,
        scope,
        components: relevantComponents,
        summaries_loaded: summaries.length,
        raw_results: rawResults.map((r) => ({
          id: r.id,
          source: r.source,
          score: r.score,
          preview: r.content.slice(0, 100),
        })),
        llm_error: err instanceof Error ? err.message : String(err),
      },
      duration_ms: Date.now() - startTime,
    };
  }

  return {
    success: true,
    message: `Digest complete: ${summaries.length} summaries + ${rawResults.length} raw results synthesized`,
    details: {
      query,
      scope,
      digest,
      components: relevantComponents,
      summaries_loaded: summaries.length,
      raw_results_count: rawResults.length,
    },
    duration_ms: Date.now() - startTime,
  };
}

export function registerRetrievalDigestSystem(): void {
  registerSystem({
    name: "retrieval_digest",
    description:
      "Progressive L0→L1→L2 retrieval with LLM synthesis. Pass {query, scope?} as params.",
    default_trigger: "on_demand",
    execute: async (params) => runRetrievalDigest(params),
  });
}
