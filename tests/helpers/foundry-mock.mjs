// AI notice: created with AI assistance (Freebuff / Codebuff). See NOTICE.md.

import { DEFAULTS, MODULE_ID } from "../../src/constants.mjs";

/**
 * Minimal Foundry-like environment for exercising the drag controller. This is
 * not a Foundry emulator; it models the v13 drag lifecycle (a preview clone is
 * moved to the cursor and a waypoint list is committed on drop) and the data
 * the module reads, so state-machine regressions are caught without a live
 * world.
 */

export class FakeTokenDocument {
  constructor({ id, x, y, widthPx = 100, heightPx = 100, disposition = 1, hidden = false, sceneId, movementSpeed = 30 }) {
    this.id = id;
    this._id = id;
    this.x = x;
    this.y = y;
    this.elevation = 0;
    this.width = widthPx / 100;
    this.height = heightPx / 100;
    this.shape = "rect";
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

  updateSource(changed = {}) {
    Object.assign(this, changed);
    this.x = Number(this.x) || 0;
    this.y = Number(this.y) || 0;
    return this;
  }
}

export class FakeToken {
  constructor(options) {
    this.id = options.id;
    this.document = new FakeTokenDocument(options);
    this.isPreview = Boolean(options.isPreview);
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
    this.renderFlagCalls = [];
    this.renderFlags = {
      set: (flags) => this.renderFlagCalls.push({ ...flags })
    };
    this.droppedCenter = null;
    this.committedWaypoints = null;
    this.committedMovement = null;
    this._dragStart = null;
    this._context = null;
    this._clone = null;
    this.layer = { _draggedToken: null };
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

  /** Foundry v13: drag start creates preview clones and a drag context. */
  _initializeDragLeft(event) {
    this.layer._draggedToken = this;
    this._dragStart = { ...this.center };
    const clone = new FakeToken({
      id: this.id,
      x: this.document.x,
      y: this.document.y,
      widthPx: this.w,
      heightPx: this.h,
      isPreview: true,
      disposition: this.document.disposition
    });
    const origin = {
      x: this.document.x,
      y: this.document.y,
      elevation: 0,
      width: this.document.width,
      height: this.document.height,
      shape: "rect"
    };
    this._clone = clone;
    this._context = {
      token: this,
      clonedToken: clone,
      origin,
      destination: { ...origin, action: "walk", snapped: false, explicit: true, checkpoint: true },
      waypoints: [],
      foundPath: [{ ...origin, action: "walk" }],
      unreachableWaypoints: [],
      hidden: false,
      updating: false,
      search: null,
      searching: false,
      searchId: 0
    };
    event.interactionData ??= {};
    event.interactionData.contexts = { [this.document.id]: this._context };
    return this._context;
  }

  /** Foundry v13: the preview clone is moved to the pointer. */
  _updateDragDestination(point) {
    const context = this._context;
    if (!context) return;
    context.destination = {
      ...context.destination,
      x: point.x - this.w / 2,
      y: point.y - this.h / 2
    };
    context.foundPath = [context.destination];
    this._clone?.document.updateSource({ x: context.destination.x, y: context.destination.y });
    this._clone?.position.set(context.destination.x, context.destination.y);
  }

  _prepareDragLeftDropUpdates() {
    const context = this._context;
    if (!context) return null;
    return [
      [{ _id: this.id }],
      {
        movement: {
          [this.id]: {
            waypoints: context.foundPath.slice(1),
            method: "dragging",
            constrainOptions: {}
          }
        }
      }
    ];
  }

  _finalizeDragLeft() {
    this.layer._draggedToken = null;
    this._context = null;
  }

  // Convenience wrappers used by the tests, mirroring the mouse interaction
  // manager handlers.
  _onDragLeftStart(event) {
    return this._initializeDragLeft(event);
  }

  _onDragLeftMove() {
    const cursor = globalThis.canvas.mousePosition;
    this._updateDragDestination({ x: cursor.x, y: cursor.y });
  }

  _onDragLeftDrop(event) {
    const result = this._prepareDragLeftDropUpdates(event);
    if (!result) return;
    const [updates, options] = result;
    const movement = options.movement?.[this.id];
    this.committedMovement = movement ?? null;
    const waypoints = movement?.waypoints ?? [];
    const commit = updates.some((update) => String(update?._id) === String(this.id));
    this.committedWaypoints = commit ? waypoints : [];
    if (commit && waypoints.length > 0) {
      const last = waypoints.at(-1);
      this.document.updateSource({ x: last.x, y: last.y });
      this.x = last.x;
      this.y = last.y;
      this.droppedCenter = { ...this.center };
    }
    this._finalizeDragLeft(event);
  }

  _onDragLeftCancel() {
    this._finalizeDragLeft({});
  }
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
    version: "13.351",
    release: { version: "13.351", generation: 13 },
    system: { id: "dnd5e", version: "5.3.3" },
    settings: {
      get: (moduleId, key) => (moduleId === MODULE_ID ? settingStore[key] ?? DEFAULTS[key] : undefined),
      set: async (moduleId, key, value) => {
        if (moduleId === MODULE_ID) settingStore[key] = value;
        return value;
      }
    },
    modules: new Map([[MODULE_ID, { id: MODULE_ID, version: "1.0.0", api: null }]]),
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
