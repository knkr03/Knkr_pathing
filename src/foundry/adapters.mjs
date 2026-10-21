/**
 * AI notice: created with AI assistance (Freebuff / Codebuff). See NOTICE.md.
 *
 * Adapters between Foundry documents and the plain-data core. All access is
 * guarded so an API change degrades to "no data" rather than a broken drag.
 */

import { extractBlockingWalls } from "../core/walls.mjs";
import { filterEnemies } from "../core/enemies.mjs";
import { createFootprint } from "../core/footprint.mjs";
import { gridSize } from "../compat.mjs";

/** @typedef {{x: number, y: number}} Point */

/** Current Foundry wall enum values, with numeric fallbacks used by the core. */
export function wallEnums() {
  const constants = globalThis.CONST ?? {};
  const result = {};
  if (constants.WALL_MOVEMENT_TYPES) result.movement = constants.WALL_MOVEMENT_TYPES;
  if (constants.WALL_DOOR_TYPES) result.door = constants.WALL_DOOR_TYPES;
  if (constants.WALL_DOOR_STATES) result.doorState = constants.WALL_DOOR_STATES;
  return result;
}

/**
 * Caches blocking wall segments for the active scene. Invalidate on any wall
 * or scene change.
 */
export class WallCache {
  constructor() {
    this.sceneId = null;
    this.walls = [];
    this.dirty = true;
  }

  invalidate() {
    this.dirty = true;
  }

  /**
   * @param {object | null} scene
   * @returns {import("../core/walls.mjs").WallSegment[]}
   */
  get(scene) {
    if (!scene) return [];
    if (!this.dirty && this.sceneId === scene.id) return this.walls;

    const placeables = globalThis.canvas?.walls?.placeables ?? [];
    const documents = [];
    for (const placeable of placeables) {
      const document = placeable?.document ?? placeable;
      if (document?.c) documents.push(document);
    }

    this.walls = extractBlockingWalls(documents, wallEnums());
    this.sceneId = scene.id;
    this.dirty = false;
    return this.walls;
  }
}

/**
 * Token center in pixels.
 * @param {object} token
 * @returns {Point | null}
 */
export function getTokenCenter(token) {
  if (!token) return null;
  const center = token.center;
  if (center && Number.isFinite(center.x) && Number.isFinite(center.y)) {
    return { x: center.x, y: center.y };
  }
  const document = token.document;
  try {
    const point = document?.getCenterPoint?.();
    if (point && Number.isFinite(point.x) && Number.isFinite(point.y)) {
      return { x: point.x, y: point.y };
    }
  } catch {
    // Fall through to the size-based calculation.
  }
  try {
    const size = document?.getSize?.();
    if (size && Number.isFinite(document?.x) && Number.isFinite(document?.y)) {
      return { x: document.x + size.width / 2, y: document.y + size.height / 2 };
    }
  } catch {
    // Fall through.
  }
  if (Number.isFinite(token.x) && Number.isFinite(token.y)) {
    return { x: token.x + (Number(token.w) || 0) / 2, y: token.y + (Number(token.h) || 0) / 2 };
  }
  return null;
}

/**
 * Document center in pixels. Unlike token.center this is stable during a drag,
 * because Foundry does not update the document until drop.
 * @param {object} token
 * @returns {Point | null}
 */
export function getDocumentCenter(token) {
  const document = token?.document;
  if (!document) return null;
  try {
    const point = document.getCenterPoint?.();
    if (point && Number.isFinite(point.x) && Number.isFinite(point.y)) {
      return { x: point.x, y: point.y };
    }
  } catch {
    // Fall through.
  }
  if (Number.isFinite(document.x) && Number.isFinite(document.y)) {
    const sizePx = gridSize(globalThis.canvas?.scene);
    return {
      x: document.x + (Number(document.width) || 1) * sizePx / 2,
      y: document.y + (Number(document.height) || 1) * sizePx / 2
    };
  }
  return null;
}

/**
 * Move a token so its center lands on the given point. Foundry stores the
 * top-left position in pixels.
 * @param {object} token
 * @param {Point} center
 */
export function setTokenCenter(token, center) {
  if (!token || !center) return;
  let width = Number(token.w);
  let height = Number(token.h);
  if (!Number.isFinite(width) || !Number.isFinite(height)) {
    const sizePx = gridSize(globalThis.canvas?.scene);
    width = (Number(token.document?.width) || 1) * sizePx;
    height = (Number(token.document?.height) || 1) * sizePx;
  }
  const x = center.x - (Number(width) || 0) / 2;
  const y = center.y - (Number(height) || 0) / 2;
  if (typeof token.position?.set === "function") token.position.set(x, y);
  else {
    token.x = x;
    token.y = y;
  }
}

/**
 * Token footprint based on the document's occupied space and the scene scale.
 * @param {object} token
 * @param {object | null} scene
 * @param {number} squeezeFactor
 * @returns {import("../core/footprint.mjs").Footprint}
 */
export function getTokenFootprint(token, scene, squeezeFactor = 0.5) {
  // TokenDocument width/height are in grid units by definition. Convert with
  // the scene's pixel grid size. Do not use getSize() here: its units have
  // differed across API generations, and a wrong assumption would silently
  // shrink or grow the collision footprint by the grid scale.
  const sizePx = gridSize(scene);
  const widthPx = Math.max(0.1, Number(token?.document?.width) || 1) * sizePx;
  const heightPx = Math.max(0.1, Number(token?.document?.height) || 1) * sizePx;
  return createFootprint({ widthPx, heightPx, squeezeFactor });
}

/** @param {object} token */
export function getDisposition(token) {
  const value = token?.document?.disposition;
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

/** @param {object} token */
export function isHiddenToken(token) {
  return Boolean(token?.document?.hidden) || getDisposition(token) === -2;
}

/**
 * Build the eligible enemy list for a moving token.
 * @param {object} movingToken
 * @param {object | null} scene
 * @param {object} runtime Settings snapshot.
 * @returns {Array<{id: string, center: Point, radius: number, disposition: number, hidden: boolean}>}
 */
export function getEnemies(movingToken, scene, runtime) {
  const placeables = globalThis.canvas?.tokens?.placeables ?? [];
  const candidates = [];

  for (const token of placeables) {
    if (!token || token === movingToken) continue;
    if (token.id === movingToken?.id) continue;
    const center = getTokenCenter(token);
    if (!center) continue;
    const footprint = getTokenFootprint(token, scene, runtime.squeezeFactor);
    candidates.push({
      id: String(token.id),
      center,
      radius: footprint.normalRadius,
      disposition: getDisposition(token),
      hidden: isHiddenToken(token)
    });
  }

  const filtered = filterEnemies(candidates, {
    policy: runtime.enemyPolicy,
    includeHidden: runtime.includeHiddenEnemies
  });

  return filtered.map((candidate) => ({
    id: candidate.id,
    center: candidate.center,
    radius: candidate.radius
  }));
}

/**
 * Cursor position in canvas coordinates.
 * @param {object} [event]
 * @returns {Point}
 */
export function getCursorPoint(event) {
  const mouse = globalThis.canvas?.mousePosition;
  if (mouse && Number.isFinite(mouse.x) && Number.isFinite(mouse.y)) {
    return { x: mouse.x, y: mouse.y };
  }
  const global = event?.global;
  if (global && Number.isFinite(global.x) && Number.isFinite(global.y)) {
    return { x: global.x, y: global.y };
  }
  return { x: 0, y: 0 };
}

/**
 * Extract a numeric movement speed for an action from a dnd5e movement object.
 * Supports both legacy flat values and newer `speeds` objects.
 * @param {object} movement
 * @param {string} action
 * @returns {number | null}
 */
function extractSpeed(movement, action) {
  if (!movement) return null;
  const candidates = [
    movement[action],
    movement.speeds?.[action],
    action === "walk" ? movement.walk : null,
    action === "walk" ? movement.speeds?.walk : null
  ];

  for (const candidate of candidates) {
    if (candidate == null) continue;
    if (typeof candidate === "number" && Number.isFinite(candidate)) return candidate;
    if (typeof candidate === "object") {
      for (const key of ["value", "total", "max", "speed"]) {
        const value = Number(candidate[key]);
        if (Number.isFinite(value)) return value;
      }
    }
    const numeric = Number(candidate);
    if (Number.isFinite(numeric)) return numeric;
  }
  return null;
}

/**
 * Native movement record for a token.
 * @param {object} token
 * @returns {{
 *   available: boolean,
 *   action: string,
 *   speed: number | null,
 *   spent: number,
 *   units: string,
 *   historyEntries: number
 * }}
 */
export function getNativeMovement(token) {
  const document = token?.document;
  const actor = token?.actor;
  const movement = actor?.system?.attributes?.movement;
  let rawAction = document?.movementAction ?? "walk";
  if (rawAction && typeof rawAction === "object") {
    rawAction = rawAction.id ?? rawAction.type ?? rawAction.key ?? "walk";
  }
  const action = String(rawAction);
  const speed = extractSpeed(movement, action);

  let entries = [];
  try {
    const history = document?.movementHistory;
    if (Array.isArray(history)) entries = history;
    else if (history?.contents) entries = Array.from(history.contents);
    else if (history && typeof history[Symbol.iterator] === "function") entries = Array.from(history);
  } catch {
    entries = [];
  }

  let spent = 0;
  for (const entry of entries) {
    if (!entry) continue;
    if (entry.action && String(entry.action) !== action) continue;
    const cost = Number(entry.cost ?? entry.distance ?? 0);
    if (Number.isFinite(cost)) spent += cost;
  }

  return {
    available: speed != null && Number.isFinite(speed),
    action,
    speed,
    spent,
    units: String(movement?.units ?? globalThis.canvas?.scene?.grid?.units ?? "ft"),
    historyEntries: entries.length
  };
}

/**
 * Module-side extra movement cost (the squeeze surcharge) that Foundry's own
 * movement record does not know about. Cleared on combat turn changes and by
 * the public API.
 */
export class MovementLedger {
  constructor() {
    this.entries = new Map();
    this.turnSignature = null;
  }

  /** @param {object} token @param {string} action */
  key(token, action) {
    return `${token?.id ?? "unknown"}|${action}`;
  }

  /** Clear all entries when the combat turn or round changes. */
  syncTurn() {
    const combat = globalThis.game?.combat;
    const signature = combat ? `${combat.id}:${combat.round}:${combat.turn}` : "no-combat";
    if (signature !== this.turnSignature) {
      this.turnSignature = signature;
      this.entries.clear();
    }
  }

  /**
   * @param {object} token
   * @param {string} action
   * @param {number} extra Scene units.
   */
  add(token, action, extra) {
    const value = Number(extra);
    if (!Number.isFinite(value) || value <= 0) return;
    const key = this.key(token, action);
    this.entries.set(key, (this.entries.get(key) ?? 0) + value);
  }

  /** @param {object} token @param {string} action */
  getExtra(token, action) {
    return this.entries.get(this.key(token, action)) ?? 0;
  }

  /** @param {object} token */
  reset(token) {
    const prefix = `${token?.id ?? "unknown"}|`;
    for (const key of [...this.entries.keys()]) {
      if (key.startsWith(prefix)) this.entries.delete(key);
    }
  }

  clear() {
    this.entries.clear();
  }
}
