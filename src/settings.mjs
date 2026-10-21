/**
 * AI notice: created with AI assistance (Freebuff / Codebuff). See NOTICE.md.
 *
 * Settings registration and typed accessors. All reads fall back to defaults
 * when Foundry is unavailable or a setting has not been registered yet.
 */

import { DEFAULTS, ENEMY_POLICY, MODULE_ID, SETTING_KEYS } from "./constants.mjs";

function localize(key) {
  try {
    return globalThis.game?.i18n?.localize(key) ?? key;
  } catch {
    return key;
  }
}

/** Register all module settings. Call during the init hook. */
export function registerSettings() {
  const settings = globalThis.game?.settings;
  if (!settings) return;

  const register = (key, options) => {
    try {
      settings.register(MODULE_ID, key, options);
    } catch (error) {
      console.warn(`Knkr Pathing | failed to register setting "${key}"`, error);
    }
  };

  register(SETTING_KEYS.enabled, {
    name: localize("KNKR_PATHING.Settings.Enabled.Name"),
    hint: localize("KNKR_PATHING.Settings.Enabled.Hint"),
    scope: "client",
    config: true,
    type: Boolean,
    default: DEFAULTS.enabled,
    onChange: () => globalThis.Hooks?.callAll("knkrPathingSettingsChanged")
  });

  register(SETTING_KEYS.squeezeFactor, {
    name: localize("KNKR_PATHING.Settings.SqueezeFactor.Name"),
    hint: localize("KNKR_PATHING.Settings.SqueezeFactor.Hint"),
    scope: "world",
    config: true,
    type: Number,
    range: { min: 0.1, max: 1, step: 0.05 },
    default: DEFAULTS.squeezeFactor
  });

  register(SETTING_KEYS.squeezeMultiplier, {
    name: localize("KNKR_PATHING.Settings.SqueezeMultiplier.Name"),
    hint: localize("KNKR_PATHING.Settings.SqueezeMultiplier.Hint"),
    scope: "world",
    config: true,
    type: Number,
    range: { min: 1, max: 4, step: 0.5 },
    default: DEFAULTS.squeezeMultiplier
  });

  register(SETTING_KEYS.markerDiameterFeet, {
    name: localize("KNKR_PATHING.Settings.MarkerDiameter.Name"),
    hint: localize("KNKR_PATHING.Settings.MarkerDiameter.Hint"),
    scope: "world",
    config: true,
    type: Number,
    range: { min: 0.5, max: 10, step: 0.5 },
    default: DEFAULTS.markerDiameterFeet
  });

  register(SETTING_KEYS.markerActivationPaddingFeet, {
    name: localize("KNKR_PATHING.Settings.MarkerPadding.Name"),
    hint: localize("KNKR_PATHING.Settings.MarkerPadding.Hint"),
    scope: "world",
    config: true,
    type: Number,
    range: { min: 0, max: 5, step: 0.25 },
    default: DEFAULTS.markerActivationPaddingFeet
  });

  register(SETTING_KEYS.enemyPolicy, {
    name: localize("KNKR_PATHING.Settings.EnemyPolicy.Name"),
    hint: localize("KNKR_PATHING.Settings.EnemyPolicy.Hint"),
    scope: "world",
    config: true,
    type: String,
    choices: {
      [ENEMY_POLICY.hostile]: localize("KNKR_PATHING.Settings.EnemyPolicy.Hostile"),
      [ENEMY_POLICY.hostileNeutral]: localize("KNKR_PATHING.Settings.EnemyPolicy.HostileNeutral"),
      [ENEMY_POLICY.nonFriendly]: localize("KNKR_PATHING.Settings.EnemyPolicy.NonFriendly")
    },
    default: DEFAULTS.enemyPolicy
  });

  register(SETTING_KEYS.includeHiddenEnemies, {
    name: localize("KNKR_PATHING.Settings.IncludeHidden.Name"),
    hint: localize("KNKR_PATHING.Settings.IncludeHidden.Hint"),
    scope: "world",
    config: true,
    type: Boolean,
    default: DEFAULTS.includeHiddenEnemies
  });

  register(SETTING_KEYS.enforceMovementBudget, {
    name: localize("KNKR_PATHING.Settings.EnforceBudget.Name"),
    hint: localize("KNKR_PATHING.Settings.EnforceBudget.Hint"),
    scope: "world",
    config: true,
    type: Boolean,
    default: DEFAULTS.enforceMovementBudget
  });

  register(SETTING_KEYS.showCostLabel, {
    name: localize("KNKR_PATHING.Settings.ShowCostLabel.Name"),
    hint: localize("KNKR_PATHING.Settings.ShowCostLabel.Hint"),
    scope: "client",
    config: true,
    type: Boolean,
    default: DEFAULTS.showCostLabel
  });

  register(SETTING_KEYS.debug, {
    name: localize("KNKR_PATHING.Settings.Debug.Name"),
    hint: localize("KNKR_PATHING.Settings.Debug.Hint"),
    scope: "client",
    config: true,
    type: Boolean,
    default: DEFAULTS.debug
  });
}

/**
 * Read a setting with a default fallback.
 * @param {string} key
 * @returns {boolean | number | string}
 */
export function getSetting(key) {
  try {
    const value = globalThis.game?.settings?.get(MODULE_ID, key);
    return value ?? DEFAULTS[key];
  } catch {
    return DEFAULTS[key];
  }
}

/**
 * Snapshot of all runtime settings used by a drag.
 * @param {object | null} scene
 * @param {number} unitsPerPixelValue
 */
export function readRuntimeSettings(scene, unitsPerPixelValue) {
  const safeUnitsPerPixel = Number(unitsPerPixelValue) > 0 ? Number(unitsPerPixelValue) : 0.05;
  const markerDiameterFeet = Number(getSetting(SETTING_KEYS.markerDiameterFeet)) || DEFAULTS.markerDiameterFeet;
  const markerPaddingFeet = Number(getSetting(SETTING_KEYS.markerActivationPaddingFeet)) || 0;
  const markerDiameter = markerDiameterFeet / safeUnitsPerPixel;
  const markerPadding = markerPaddingFeet / safeUnitsPerPixel;

  return {
    enabled: Boolean(getSetting(SETTING_KEYS.enabled)),
    squeezeFactor: Number(getSetting(SETTING_KEYS.squeezeFactor)) || DEFAULTS.squeezeFactor,
    squeezeMultiplier: Number(getSetting(SETTING_KEYS.squeezeMultiplier)) || DEFAULTS.squeezeMultiplier,
    markerDiameterFeet,
    markerPaddingFeet,
    markerDiameter,
    markerPadding,
    markerBackoff: markerDiameter + markerPadding,
    enemyPolicy: String(getSetting(SETTING_KEYS.enemyPolicy) ?? DEFAULTS.enemyPolicy),
    includeHiddenEnemies: Boolean(getSetting(SETTING_KEYS.includeHiddenEnemies)),
    enforceMovementBudget: Boolean(getSetting(SETTING_KEYS.enforceMovementBudget)),
    showCostLabel: Boolean(getSetting(SETTING_KEYS.showCostLabel)),
    debug: Boolean(getSetting(SETTING_KEYS.debug)),
    unitsPerPixel: safeUnitsPerPixel,
    scene: scene?.id ?? null
  };
}

/** @param {...unknown} args */
export function debugLog(...args) {
  try {
    if (getSetting(SETTING_KEYS.debug)) console.debug("Knkr Pathing |", ...args);
  } catch {
    // Logging must never break a drag.
  }
}
