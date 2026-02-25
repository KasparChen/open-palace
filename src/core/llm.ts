/**
 * LLM calling utility for Librarian and Retrieval+Digest systems.
 *
 * Strategy (configurable via config.yaml `llm.mode`):
 *   "auto" (default) — try MCP Sampling first (uses host LLM), fall back to direct Anthropic API
 *   "sampling"        — only use MCP Sampling, fail if host doesn't support it
 *   "direct"          — only use direct Anthropic API, requires API key
 *
 * MCP Sampling means the MCP Server asks the host (OpenClaw / Claude Desktop / Cursor)
 * to perform the LLM call. This way no separate API key is needed.
 */

import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { getConfig } from "./config.js";

export interface LLMMessage {
  role: "user" | "assistant";
  content: string;
}

export interface LLMCallOptions {
  system?: string;
  messages: LLMMessage[];
  maxTokens?: number;
  temperature?: number;
}

export interface LLMResponse {
  content: string;
  model: string;
  usage?: { input_tokens: number; output_tokens: number };
}

// ─── Server reference for MCP Sampling ───────────────────

let serverRef: Server | null = null;

/**
 * Set the MCP Server reference so LLM calls can use Sampling.
 * Called once during server initialization.
 */
export function setServerRef(server: Server): void {
  serverRef = server;
}

// ─── Config helpers ──────────────────────────────────────

async function getLLMMode(): Promise<"sampling" | "direct" | "auto"> {
  const config = await getConfig();
  return config.llm?.mode ?? "auto";
}

async function getAnthropicKey(): Promise<string> {
  const config = await getConfig();
  return config.llm?.anthropic_api_key || process.env.ANTHROPIC_API_KEY || "";
}

async function getModelId(): Promise<string> {
  const config = await getConfig();
  return (
    config.llm?.model ||
    config.librarian?.llm?.model ||
    process.env.OPEN_PALACE_LLM_MODEL ||
    "claude-sonnet-4-20250514"
  );
}

// ─── MCP Sampling ────────────────────────────────────────

async function callViaSampling(options: LLMCallOptions): Promise<LLMResponse> {
  if (!serverRef) {
    throw new Error("MCP Server reference not set — cannot use sampling");
  }

  const messages = options.messages.map((m) => ({
    role: m.role as "user" | "assistant",
    content: { type: "text" as const, text: m.content },
  }));

  const result = await serverRef.createMessage({
    messages,
    maxTokens: options.maxTokens ?? 4096,
    ...(options.system ? { systemPrompt: options.system } : {}),
    ...(options.temperature !== undefined
      ? { temperature: options.temperature }
      : {}),
    modelPreferences: {
      hints: [{ name: "claude-sonnet" }],
      costPriority: 0.8,
      intelligencePriority: 0.5,
    },
  });

  const content = Array.isArray(result.content)
    ? result.content
        .filter((c: { type: string }) => c.type === "text")
        .map((c: { type: string; text?: string }) => c.text ?? "")
        .join("")
    : typeof result.content === "object" && "text" in result.content
      ? (result.content as { text: string }).text
      : String(result.content);

  return {
    content,
    model: result.model,
  };
}

// ─── Direct Anthropic API ────────────────────────────────

async function callViaDirect(options: LLMCallOptions): Promise<LLMResponse> {
  const apiKey = await getAnthropicKey();
  if (!apiKey) {
    throw new Error(
      "No Anthropic API key configured. Set ANTHROPIC_API_KEY env var, add llm.anthropic_api_key to ~/.open-palace/config.yaml, or use a host that supports MCP Sampling (llm.mode: 'auto')"
    );
  }

  const model = await getModelId();
  const maxTokens = options.maxTokens ?? 4096;

  const body: Record<string, unknown> = {
    model,
    max_tokens: maxTokens,
    messages: options.messages,
  };

  if (options.system) {
    body.system = options.system;
  }
  if (options.temperature !== undefined) {
    body.temperature = options.temperature;
  }

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Anthropic API error (${response.status}): ${errText}`);
  }

  const data = (await response.json()) as {
    content: { type: string; text: string }[];
    model: string;
    usage: { input_tokens: number; output_tokens: number };
  };

  const textContent = data.content
    .filter((c) => c.type === "text")
    .map((c) => c.text)
    .join("");

  return {
    content: textContent,
    model: data.model,
    usage: data.usage,
  };
}

// ─── Public API ──────────────────────────────────────────

/**
 * Call the LLM using the configured strategy.
 * Default "auto" mode: try MCP Sampling first, fall back to direct API.
 */
export async function callLLM(options: LLMCallOptions): Promise<LLMResponse> {
  const mode = await getLLMMode();

  if (mode === "sampling") {
    return callViaSampling(options);
  }

  if (mode === "direct") {
    return callViaDirect(options);
  }

  // "auto" — try sampling first, fall back to direct
  try {
    return await callViaSampling(options);
  } catch {
    // Sampling failed (client may not support it), try direct API
    return callViaDirect(options);
  }
}

/**
 * Helper: single-turn LLM call with system prompt and user message.
 */
export async function askLLM(
  systemPrompt: string,
  userMessage: string,
  maxTokens?: number
): Promise<string> {
  const response = await callLLM({
    system: systemPrompt,
    messages: [{ role: "user", content: userMessage }],
    maxTokens,
    temperature: 0.3,
  });
  return response.content;
}
