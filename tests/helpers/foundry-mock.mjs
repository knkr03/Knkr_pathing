// AI notice: created with AI assistance (Freebuff / Codebuff). See NOTICE.md.

import { DEFAULTS, MODULE_ID } from "../../src/constants.mjs";

/**
 * Minimal Foundry-like environment for exercising the drag controller. This is
 * not a Foundry emulator; it models only the drag lifecycle and data the module
 * reads, so state-machine regressions are caught without a live world.
 */

export class FakeTokenDocument {
  constructor({ id, x, y, widthPx = 100, heightPx = 100, disposition = 1, hidden = false, sceneId, movementSpeed = 30 }) {
    this.id = id;
    this._id = id;
    this.x = x;
    this.y = y;
    this.width = widthPx / 100;
    this.height = heightPx / 100;
    this.disposition = disposition;
    this.hidden = hidden;
    this.parent = { id: sceneId };
    this.movementAction = "walk";
    this.movementHistory = [];
    this.texture = { scaleX: 1, scaleY: 1 };
    this._size = { width: widthPx, height: heightPx };
    this._speed = movementSpeed;
  }

  getSize() {
    return { ...this._size };
  }

  getCenterPoint() {
    return { x: this.x + this._size.width / 2, y: this.y + this._size.height / 2 };
  }
}

export class FakeToken {
  constructor(options) {
    this.id = options.id;
    this.document = new FakeTokenDocument(options);
    this.w = options.widthPx ?? 100;
    this.h = options.heightPx ?? 100;
    this.x = options.x;
    this.y = options.y;
    this.actor = options.actor ?? {
      system: {
        attributes: {
          movement: { walk: options.movementSpeed ?? 30, units: "ft" }
        }
      }
    };
    this.droppedCenter = null;
    this._dragStart = null;
  }

  get center() {
    return { x: this.x + this.w / 2, y: this.y + this.h / 2 };
  }

  get position() {
    return {
      set: (x, y) => {
        this.x = x;
        this.y = y;
      }
    };
  }

  // Foundry-like drag lifecycle. The move handler positions the token at the
  // cursor, then the module wrapper constrains it.
  _onDragLeftStart() {
    this._dragStart = { ...this.center };
  }

  _onDragLeftMove() {
    const cursor = globalThis.canvas.mousePosition;
    this.x = cursor.x - this.w / 2;
    this.y = cursor.y - this.h / 2;
  }

  _onDragLeftDrop() {
    this.droppedCenter = { ...this.center };
    this.document.x = this.x;
    this.document.y = this.y;
  }

  _onDragLeftCancel() {}
}

/** @param {object} scene */
export function makeScene(scene = {}) {
  return {
    id: scene.id ?? "test-scene",
    grid: {
      type: 0,
      size: 100,
      distance: 5,
      units: "ft",
      isGridless: true,
      ...scene.grid
    },
    ...scene
  };
}

/**
 * @param {object} options
 * @param {object[]} [options.walls] Raw wall documents.
 * @param {FakeToken[]} [options.tokens]
 * @param {object} [options.settings]
 * @param {object} [options.scene]
 */
export function installFoundryMock({ walls = [], tokens = [], settings = {}, scene = {}, controlled } = {}) {
  const activeScene = makeScene(scene);
  const wallPlaceables = walls.map((document, index) => ({ id: `wall-placeable-${index}`, document }));

  globalThis.CONST = {
    GRID_TYPES: { GRIDLESS: 0, SQUARE: 1 },
    WALL_MOVEMENT_TYPES: { NONE: 0, NORMAL: 1, LIMITED: 2, DOUBLE: 3 },
    WALL_DOOR_TYPES: { NONE: 0, DOOR: 1, SECRET: 2 },
    WALL_DOOR_STATES: { CLOSED: 0, OPEN: 1, LOCKED: 2 },
    TOKEN_DISPOSITIONS: { SECRET: -2, HOSTILE: -1, NEUTRAL: 0, FRIENDLY: 1 }
  };

  const settingStore = { ...DEFAULTS, ...settings };

  globalThis.game = {
    version: "13.341",
    release: { version: "13.341", generation: 13 },
    system: { id: "dnd5e", version: "4.0.0" },
    settings: {
      get: (moduleId, key) => (moduleId === MODULE_ID ? settingStore[key] ?? DEFAULTS[key] : undefined),
      set: async (moduleId, key, value) => {
        if (moduleId === MODULE_ID) settingStore[key] = value;
        return value;
      }
    },
    modules: new Map([[MODULE_ID, { id: MODULE_ID, version: "0.1.0", api: null }]]),
    combat: { id: "combat-1", round: 1, turn: 0 },
    i18n: { localize: (key) => key, format: (key) => key },
    keybindings: { register: () => {} }
  };

  globalThis.ui = {
    notifications: { error: () => {}, warn: () => {}, info: () => {} }
  };

  globalThis.Hooks = { on: () => {}, once: () => {}, callAll: () => {} };

  globalThis.canvas = {
    ready: true,
    scene: activeScene,
    mousePosition: { x: 0, y: 0 },
    dimensions: { width: 1920, height: 1080 },
    tokens: {
      placeables: tokens,
      controlled: controlled ?? (tokens.length > 0 ? [tokens[0]] : [])
    },
    walls: { placeables: wallPlaceables },
    interface: { addChild: () => {} }
  };

  globalThis.foundry = {
    canvas: { placeables: { Token: FakeToken } }
  };

  return { scene: activeScene, settings: settingStore, tokens, wallPlaceables };
}

export function centerAt(x, y) {
  return { x, y };
}
