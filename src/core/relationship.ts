/**
 * Relationship Memory — interaction patterns and trust tracking.
 *
 * Records how the agent interacts with external entities (users, agents).
 * Interaction tags accumulate automatically; trust changes require explicit action.
 * Stored alongside the component at components/relationships/{entity_id}/profile.yaml.
 */

import { paths } from "../utils/paths.js";
import { readYaml, writeYaml } from "../utils/yaml.js";
import { isoNow } from "../utils/id.js";
import { triggerHook } from "./posthook.js";
import { recordChangelog } from "./changelog.js";
import { createComponent, loadComponent } from "./component.js";
import type { RelationshipProfile, InteractionTag, TrustChange } from "../types.js";

async function ensureRelationshipComponent(entityId: string): Promise<void> {
  const loaded = await loadComponent(`relationships/${entityId}`);
  if (!loaded) {
    await createComponent(
      "relationships",
      entityId,
      `Relationship profile for ${entityId}`
    );
  }
}

export async function getRelationship(
  entityId: string
): Promise<RelationshipProfile | null> {
  return readYaml<RelationshipProfile>(paths.relationshipProfile(entityId));
}

function defaultProfile(entityId: string): RelationshipProfile {
  return {
    entity_id: entityId,
    type: "user",
    profile: {},
    interaction_tags: [],
    trust_score: 0.5,
    trust_history: [],
  };
}

export async function updateProfile(
  entityId: string,
  updates: Partial<RelationshipProfile["profile"]> & { type?: RelationshipProfile["type"] }
): Promise<RelationshipProfile> {
  await ensureRelationshipComponent(entityId);

  const existing = (await getRelationship(entityId)) ?? defaultProfile(entityId);

  if (updates.type) existing.type = updates.type;
  existing.profile = { ...existing.profile, ...updates };
  // Remove the type key from profile if it leaked in
  delete (existing.profile as Record<string, unknown>).type;

  await writeYaml(paths.relationshipProfile(entityId), existing);

  await recordChangelog({
    scope: `relationships/${entityId}`,
    type: "operation",
    action: "profile_update",
    summary: `Updated profile for ${entityId}`,
  });

  await triggerHook("relationship.update", {
    scope: `relationships/${entityId}`,
    summary: `profile updated: ${entityId}`,
  });

  return existing;
}

export async function logInteraction(
  entityId: string,
  tags: string[]
): Promise<RelationshipProfile> {
  await ensureRelationshipComponent(entityId);

  const existing = (await getRelationship(entityId)) ?? defaultProfile(entityId);
  const now = isoNow().slice(0, 10);

  for (const tag of tags) {
    const found = existing.interaction_tags.find((t) => t.tag === tag);
    if (found) {
      found.count += 1;
      found.last = now;
    } else {
      existing.interaction_tags.push({ tag, count: 1, last: now });
    }
  }

  await writeYaml(paths.relationshipProfile(entityId), existing);

  await recordChangelog({
    scope: `relationships/${entityId}`,
    type: "operation",
    action: "interaction_logged",
    summary: `Interaction tags: ${tags.join(", ")}`,
  });

  await triggerHook("relationship.update", {
    scope: `relationships/${entityId}`,
    summary: `interaction logged: ${tags.join(", ")}`,
  });

  return existing;
}

export async function updateTrust(
  entityId: string,
  delta: number,
  reason: string
): Promise<RelationshipProfile> {
  await ensureRelationshipComponent(entityId);

  const existing = (await getRelationship(entityId)) ?? defaultProfile(entityId);

  existing.trust_score = Math.max(0, Math.min(1, existing.trust_score + delta));

  const change: TrustChange = {
    date: isoNow().slice(0, 10),
    delta,
    reason,
  };
  existing.trust_history.push(change);

  await writeYaml(paths.relationshipProfile(entityId), existing);

  await recordChangelog({
    scope: `relationships/${entityId}`,
    type: "operation",
    action: "trust_update",
    summary: `Trust ${delta >= 0 ? "+" : ""}${delta}: ${reason}`,
  });

  await triggerHook("relationship.update", {
    scope: `relationships/${entityId}`,
    summary: `trust updated: ${delta >= 0 ? "+" : ""}${delta}`,
  });

  return existing;
}
