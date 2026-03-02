/**
 * PostHook Engine — automatically triggers side effects after write operations.
 *
 * Design: Code-level pipelines, not prompt instructions.
 * Agent "calls" the system; it doesn't need to "remember to execute" anything.
 */

import type { HookEvent, HookContext } from "../types.js";
import { gitCommit } from "./git.js";
import { isoNow } from "../utils/id.js";
import { scheduleDebouncedReindex } from "./search.js";

type HookHandler = (ctx: HookContext) => Promise<void>;

const hooks: Map<HookEvent, HookHandler[]> = new Map();

export function registerHook(event: HookEvent, handler: HookHandler): void {
  const existing = hooks.get(event) ?? [];
  existing.push(handler);
  hooks.set(event, existing);
}

export async function triggerHook(
  event: HookEvent,
  payload: Record<string, unknown>
): Promise<void> {
  const ctx: HookContext = { event, payload, timestamp: isoNow() };
  const handlers = hooks.get(event) ?? [];
  for (const handler of handlers) {
    try {
      await handler(ctx);
    } catch (err) {
      console.error(`[posthook] handler failed for ${event}:`, err);
    }
  }
}

/**
 * Register built-in hooks for git auto-commit on write operations.
 */
export function registerBuiltinHooks(): void {
  const autoCommitEvents: HookEvent[] = [
    "entity.update_soul",
    "entity.create",
    "changelog.record",
    "summary.update",
    "component.create",
    "index.update",
    "scratch.write",
    "scratch.promote",
    "snapshot.save",
    "relationship.update",
  ];

  for (const event of autoCommitEvents) {
    registerHook(event, async (ctx) => {
      const scope = (ctx.payload.scope as string) ?? event;
      const summary = (ctx.payload.summary as string) ?? event;
      await gitCommit(`${scope}: ${summary}`);
    });
  }

  // Schedule debounced search reindex after data-changing events
  const reindexEvents: HookEvent[] = [
    "changelog.record",
    "summary.update",
    "component.create",
    "scratch.write",
    "relationship.update",
  ];

  for (const event of reindexEvents) {
    registerHook(event, async () => {
      await scheduleDebouncedReindex();
    });
  }
}
