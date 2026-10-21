/**
 * AI notice: created with AI assistance (Freebuff / Codebuff). See NOTICE.md.
 *
 * Shared constants for Knkr Pathing. This module is safe to import outside Foundry.
 */

export const MODULE_ID = "knkr-pathing";
export const MODULE_TITLE = "Knkr Pathing";
export const REQUIRED_FOUNDRY_GENERATION = 13;
export const TARGET_FOUNDRY_GENERATIONS = [13, 14];

/** Foundry setting keys. */
export const SETTING_KEYS = Object.freeze({
  enabled: "enabled",
  squeezeFactor: "squeezeFactor",
  squeezeMultiplier: "squeezeMultiplier",
  markerDiameterFeet: "markerDiameterFeet",
  markerActivationPaddingFeet: "markerActivationPaddingFeet",
  enemyPolicy: "enemyPolicy",
  includeHiddenEnemies: "includeHiddenEnemies",
  enforceMovementBudget: "enforceMovementBudget",
  showCostLabel: "showCostLabel",
  debug: "debug"
});

/** Default values. Keep in sync with settings.mjs and README.md. */
export const DEFAULTS = Object.freeze({
  enabled: true,
  squeezeFactor: 0.5,
  squeezeMultiplier: 2,
  markerDiameterFeet: 1.5,
  markerActivationPaddingFeet: 0.25,
  enemyPolicy: "hostile",
  includeHiddenEnemies: false,
  enforceMovementBudget: true,
  showCostLabel: true,
  debug: false
});

/** Planner status values. */
export const PLAN_STATUS = Object.freeze({
  normal: "normal",
  squeeze: "squeeze",
  contact: "contact",
  budget: "budget",
  impassable: "impassable"
});

/** Per-segment clearance classification. */
export const SEGMENT_MODE = Object.freeze({
  normal: "normal",
  squeeze: "squeeze",
  blocked: "blocked"
});

/** Enemy collision policies. */
export const ENEMY_POLICY = Object.freeze({
  hostile: "hostile",
  hostileNeutral: "hostile-neutral",
  nonFriendly: "non-friendly"
});

/** Foundry token dispositions (numeric fallbacks used when CONST is unavailable). */
export const TOKEN_DISPOSITION = Object.freeze({
  secret: -2,
  hostile: -1,
  neutral: 0,
  friendly: 1
});

/** Wall enums (numeric fallbacks; adapters prefer Foundry CONST values). */
export const WALL_MOVEMENT = Object.freeze({ none: 0, normal: 1, double: 2, limited: 3 });
export const WALL_DOOR = Object.freeze({ none: 0, door: 1, secret: 2 });
export const WALL_DOOR_STATE = Object.freeze({ closed: 0, open: 1, locked: 2 });

/** Geometry tolerance in canvas pixels. */
export const GEOMETRY_EPSILON = 0.5;

/** Drag replanning threshold in canvas pixels. */
export const REPLAN_THRESHOLD = 1.5;

/** Minimum time between full replans during a drag, in milliseconds. */
export const MIN_REPLAN_INTERVAL_MS = 24;

export const SOCKET_CHANNEL = `module.${MODULE_ID}`;
