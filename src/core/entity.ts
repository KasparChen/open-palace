/**
 * Entity Registry — manages agent identities, SOUL synchronization,
 * and evolution history tracking.
 *
 * Open Palace doesn't redesign the personality system.
 * It only handles: cross-instance sync, evolution history, and fast retrieval.
 */

import fs from "node:fs/promises";
import { paths } from "../utils/paths.js";
import { readYaml, writeYaml } from "../utils/yaml.js";
import { triggerHook } from "./posthook.js";
import { isoNow } from "../utils/id.js";
import { writeSoulToWorkspace } from "./sync.js";
import type { Entity, EvolutionEntry } from "../types.js";

export async function listEntities(): Promise<Entity[]> {
  const dir = paths.entitiesDir();
  try {
    const files = await fs.readdir(dir);
    const entities: Entity[] = [];
    for (const file of files) {
      if (!file.endsWith(".yaml")) continue;
      const entity = await readYaml<Entity>(`${dir}/${file}`);
      if (entity) entities.push(entity);
    }
    return entities;
  } catch {
    return [];
  }
}

export async function getEntity(entityId: string): Promise<Entity | null> {
  return readYaml<Entity>(paths.entity(entityId));
}

export async function getSoul(entityId: string): Promise<string | null> {
  const entity = await getEntity(entityId);
  return entity?.soul_content ?? null;
}

export async function getEntityFull(entityId: string): Promise<Entity | null> {
  return getEntity(entityId);
}

export async function createEntity(
  entityId: string,
  displayName: string,
  description: string,
  soulContent: string = ""
): Promise<Entity> {
  const entity: Entity = {
    entity_id: entityId,
    display_name: displayName,
    description,
    soul_content: soulContent,
    evolution_log: [],
    host_mappings: {},
  };

  if (soulContent) {
    entity.evolution_log.push({
      time: isoNow(),
      source: "mp.entity.create",
      change_summary: "Initial entity creation",
    });
  }

  await writeYaml(paths.entity(entityId), entity);
  await triggerHook("entity.create", {
    scope: `entity/${entityId}`,
    summary: `created entity: ${displayName}`,
  });
  return entity;
}

export async function updateSoul(
  entityId: string,
  content: string,
  reason: string
): Promise<Entity> {
  let entity = await getEntity(entityId);
  if (!entity) {
    throw new Error(`Entity not found: ${entityId}`);
  }

  entity.soul_content = content;

  const evolutionEntry: EvolutionEntry = {
    time: isoNow(),
    source: "mp.entity.update_soul",
    change_summary: reason,
  };
  entity.evolution_log.push(evolutionEntry);

  await writeYaml(paths.entity(entityId), entity);

  // Bidirectional sync: write back to OpenClaw workspace SOUL.md
  const wroteBack = await writeSoulToWorkspace(entityId, content);

  await triggerHook("entity.update_soul", {
    scope: `entity/${entityId}`,
    summary: `soul updated: ${reason}${wroteBack ? " (synced to workspace)" : ""}`,
    entity_id: entityId,
  });
  return entity;
}

export async function logEvolution(
  entityId: string,
  changeSummary: string,
  source: string
): Promise<Entity> {
  const entity = await getEntity(entityId);
  if (!entity) {
    throw new Error(`Entity not found: ${entityId}`);
  }

  entity.evolution_log.push({
    time: isoNow(),
    source,
    change_summary: changeSummary,
  });

  await writeYaml(paths.entity(entityId), entity);
  return entity;
}
