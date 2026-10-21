/**
 * AI notice: created with AI assistance (Freebuff / Codebuff). See NOTICE.md.
 *
 * Drag controller. Wraps the core token drag lifecycle, plans a constrained
 * route during the drag, and writes the furthest legal center back to the token
 * so Foundry's own drop commits an already-valid position.
 */

import { MIN_REPLAN_INTERVAL_MS, REPLAN_THRESHOLD } from "../constants.mjs";
import { getTokenClass, gridSize, isGridlessScene, sceneUnits, unitsPerPixel } from "../compat.mjs";
import { planMovement } from "../core/planner.mjs";
import { angleDelta } from "../core/geometry.mjs";
import { angleOf, distance } from "../core/vec.mjs";
import { clearanceAtPoint } from "../core/walls.mjs";
import { markerContainsPoint } from "../core/squeeze.mjs";
import { findEnemyUnderCursor, isTouchingEnemy, resolveRotation } from "../core/enemies.mjs";
import { debugLog, readRuntimeSettings } from "../settings.mjs";
import {
  getCursorPoint,
  getDocumentCenter,
  getEnemies,
  getNativeMovement,
  getTokenCenter,
  getTokenFootprint,
  setTokenCenter
} from "./adapters.mjs";

const ROTATION_STEP = Math.PI / 90;
const ROTATION_PREVIEW_STEP = Math.PI / 18;
const CONTACT_TOLERANCE = 3;

export class DragController {
  /**
   * @param {object} options
   * @param {import("./preview.mjs").PreviewRenderer} options.preview
   * @param {import("./adapters.mjs").WallCache} options.wallCache
   * @param {import("./adapters.mjs").MovementLedger} options.ledger
   */
  constructor({ preview, wallCache, ledger }) {
    this.preview = preview;
    this.wallCache = wallCache;
    this.ledger = ledger;
    this.patches = [];
    this.session = null;
    this.installed = false;
    this.errorNotified = false;
  }

  /** @returns {boolean} */
  install() {
    if (this.installed) return true;
    const TokenClass = getTokenClass();
    if (!TokenClass) return false;

    const proto = TokenClass.prototype;
    const methods = ["_onDragLeftStart", "_onDragLeftMove", "_onDragLeftDrop", "_onDragLeftCancel"];
    for (const method of methods) {
      if (typeof proto[method] !== "function") return false;
    }

    const controller = this;

    for (const method of methods) {
      const original = proto[method];
      const wrapped = function knkrPathingDragWrapper(...args) {
        if (method === "_onDragLeftStart") {
          const result = original.apply(this, args);
          try {
            controller.onDragStart(this, args[0]);
          } catch (error) {
            controller.handleError(error);
          }
          return result;
        }

        if (method === "_onDragLeftMove") {
          const result = original.apply(this, args);
          try {
            controller.onDragMove(this, args[0]);
          } catch (error) {
            controller.handleError(error);
          }
          return result;
        }

        if (method === "_onDragLeftDrop") {
          try {
            controller.beforeDrop(this);
          } catch (error) {
            controller.handleError(error);
          }
          const result = original.apply(this, args);
          if (result && typeof result.then === "function") {
            return result
              .then((value) => {
                try {
                  controller.afterDrop(this, { verify: true });
                } catch (error) {
                  controller.handleError(error);
                }
                return value;
              })
              .catch((error) => {
                controller.handleError(error);
                throw error;
              });
          }
          try {
            controller.afterDrop(this);
          } catch (error) {
            controller.handleError(error);
          }
          return result;
        }

        // _onDragLeftCancel
        try {
          controller.onCancel(this);
        } catch (error) {
          controller.handleError(error);
        }
        return original.apply(this, args);
      };

      wrapped.__knkrPathingWrapped = true;
      proto[method] = wrapped;
      this.patches.push({ proto, method, original });
    }

    this.installed = true;
    debugLog("drag controller installed");
    return true;
  }

  uninstall() {
    for (const { proto, method, original } of this.patches) {
      if (proto[method]?.__knkrPathingWrapped) proto[method] = original;
    }
    this.patches = [];
    this.installed = false;
    this.endSession();
  }

  /** Called by hooks when wall geometry or scene state changes. */
  invalidate() {
    this.wallCache.invalidate();
    if (this.session) this.session.forceReplan = true;
  }

  /** @param {object} token */
  isEligible(token) {
    const scene = globalThis.canvas?.scene;
    if (!scene || !token?.document) return false;
    if (token.document.parent?.id && token.document.parent.id !== scene.id) return false;
    if (!isGridlessScene(scene)) return false;
    const controlled = globalThis.canvas?.tokens?.controlled ?? [];
    if (controlled.length > 1) {
      debugLog("multi-token drag ignored", controlled.length);
      return false;
    }
    return true;
  }

  /**
   * @param {object} token
   * @param {object} [event]
   */
  onDragStart(token, event) {
    if (!this.isEligible(token)) {
      this.session = null;
      return;
    }

    const scene = globalThis.canvas.scene;
    const runtime = readRuntimeSettings(scene, unitsPerPixel(scene));
    if (!runtime.enabled) {
      this.session = null;
      return;
    }

    const origin = getDocumentCenter(token);
    if (!origin) return;

    this.ledger.syncTurn();
    const movement = getNativeMovement(token);
    // A turn-based budget only makes sense during combat. Outside combat the
    // preview still reports costs, but the token is not clamped to a speed.
    const inCombat = Boolean(globalThis.game?.combat);
    if (movement.historyEntries === 0) this.ledger.reset(token);

    let budget = null;
    if (runtime.enforceMovementBudget && movement.available && inCombat) {
      budget = Math.max(0, movement.speed - movement.spent - this.ledger.getExtra(token, movement.action));
    }

    const footprint = getTokenFootprint(token, scene, runtime.squeezeFactor);
    const walls = this.wallCache.get(scene);
    const startClearance = walls.length > 0
      ? clearanceAtPoint(origin, walls)
      : Infinity;
    // A token that was dropped inside a squeeze-only passage keeps its
    // squeezing state on the next drag, until it clears normal clearance.
    const startsSqueezed = startClearance < footprint.normalRadius - 0.5
      && startClearance >= footprint.squeezeRadius - 0.5;

    this.session = {
      token,
      sceneId: scene.id,
      origin,
      footprint,
      runtime,
      movement,
      budget,
      walls,
      enemies: [],
      squeezeActive: startsSqueezed,
      rotationEnemyId: null,
      rotationAngle: null,
      appliedCenter: origin,
      lastGoal: null,
      lastCursor: null,
      lastPlan: null,
      executedPlan: null,
      lastPlanAt: 0,
      markerCache: [],
      forceReplan: true
    };

    this.preview.attach();
    if (startsSqueezed) debugLog("starting drag in squeeze state", { clearance: startClearance });
    debugLog("drag start", {
      token: token.id,
      origin,
      radius: footprint.normalRadius,
      squeezeRadius: footprint.squeezeRadius,
      budget,
      action: movement.action,
      foundry: globalThis.game?.version
    });
  }

  /**
   * @param {object} token
   * @param {object} [event]
   */
  onDragMove(token, event) {
    const session = this.session;
    if (!session || session.token !== token) return;

    const scene = globalThis.canvas?.scene;
    if (!scene || scene.id !== session.sceneId || !isGridlessScene(scene)) {
      this.endSession();
      return;
    }

    const runtime = readRuntimeSettings(scene, unitsPerPixel(scene));
    if (!runtime.enabled) {
      this.endSession();
      return;
    }
    session.runtime = runtime;

    const proposed = getTokenCenter(token);
    if (!proposed) return;
    const cursor = getCursorPoint(event);

    const unchanged = !session.forceReplan
      && session.lastGoal
      && distance(proposed, session.lastGoal) < REPLAN_THRESHOLD
      && session.lastCursor
      && distance(cursor, session.lastCursor) < REPLAN_THRESHOLD;

    if (unchanged) {
      this.applyCenter(session, session.appliedCenter);
      return;
    }

    const now = globalThis.performance?.now?.() ?? Date.now();
    const cursorMoved = session.lastCursor ? distance(cursor, session.lastCursor) : Infinity;
    const goalMoved = session.lastGoal ? distance(proposed, session.lastGoal) : Infinity;
    const smallStep = Math.max(REPLAN_THRESHOLD, session.footprint.normalRadius * 0.15);
    if (
      !session.forceReplan
      && session.lastPlanAt
      && now - session.lastPlanAt < MIN_REPLAN_INTERVAL_MS
      && cursorMoved < smallStep
      && goalMoved < smallStep
    ) {
      // Throttle graph construction only for small pointer movements. Larger
      // jumps replan immediately. The token is re-applied to its last legal
      // center, so throttling cannot leak motion.
      this.applyCenter(session, session.appliedCenter);
      return;
    }

    session.forceReplan = false;
    session.lastGoal = proposed;
    session.lastCursor = cursor;
    session.lastPlanAt = now;
    session.walls = this.wallCache.get(scene);

    const frame = this.computeFrame(session, proposed, cursor);
    session.lastPlan = frame.plan;
    session.executedPlan = frame.executedPlan ?? frame.plan;
    session.appliedCenter = frame.appliedCenter;

    this.applyCenter(session, frame.appliedCenter);
    this.preview.draw(frame.plan, {
      units: sceneUnits(scene),
      showCostLabel: runtime.showCostLabel,
      squeezeMultiplier: runtime.squeezeMultiplier,
      squeezeActive: session.squeezeActive,
      appliedCenter: frame.appliedCenter
    });
  }

  /**
   * @param {object} session
   * @param {{x: number, y: number}} proposed
   * @param {{x: number, y: number}} cursor
   */
  computeFrame(session, proposed, cursor) {
    const scene = globalThis.canvas.scene;
    const runtime = session.runtime;
    const walls = session.walls;
    const enemies = getEnemies(session.token, scene, runtime);
    session.enemies = enemies;

    const rotation = this.tryRotation(session, cursor, enemies, walls);
    if (rotation) return rotation;

    session.rotationEnemyId = null;
    session.rotationAngle = null;

    let plan = this.plan(session, proposed, true);
    let executedPlan = plan;
    let appliedCenter = plan.endpoint;

    const visibleMarkers = this.relevantMarkers(session, plan, proposed, runtime);
    if (visibleMarkers.length > 0 && plan.markers.length === 0) {
      // The route to the marker itself is normal-clearance, so the planner
      // correctly stops producing a squeeze route as the cursor reaches it.
      // Keep the cached marker visible and actionable at the passage entrance.
      plan = { ...plan, markers: visibleMarkers };
    }

    if (session.squeezeActive) {
      const normalPlan = this.plan(session, proposed, false);
      if (normalPlan.complete) {
        session.squeezeActive = false;
        session.markerCache = [];
        plan = normalPlan;
        executedPlan = normalPlan;
        appliedCenter = normalPlan.endpoint;
      }
    }

    if (!session.squeezeActive) {
      const activation = visibleMarkers.find((marker) =>
        markerContainsPoint(proposed, marker, runtime.markerPadding)
      );

      if (activation) {
        session.squeezeActive = true;
        session.markerCache = [];
        appliedCenter = plan.endpoint;
        debugLog("squeeze activated", { marker: activation, goal: proposed });
      } else if (plan.routeMode === "squeeze") {
        const normalPlan = this.plan(session, proposed, false);
        appliedCenter = normalPlan.endpoint;
        executedPlan = normalPlan;
      }
    }

    return { plan, executedPlan, appliedCenter };
  }

  /**
   * Markers relevant to the current cursor position. The planner's own markers
   * are authoritative; cached markers keep the interaction alive when the
   * cursor moves onto the marker (where the route no longer needs squeezing).
   * @param {object} session
   * @param {object} plan
   * @param {{x: number, y: number}} proposed
   * @param {object} runtime
   */
  relevantMarkers(session, plan, proposed, runtime) {
    if (session.squeezeActive) return [];

    if (plan.markers.length > 0) {
      session.markerCache = plan.markers;
      return plan.markers;
    }

    const cached = session.markerCache ?? [];
    if (cached.length === 0) return [];

    const approachRadius = session.footprint.normalRadius + runtime.markerPadding;
    return cached.filter((marker) =>
      distance(proposed, marker) <= marker.radius + approachRadius
    );
  }

  /**
   * @param {object} session
   * @param {{x: number, y: number}} goal
   * @param {boolean} allowSqueeze
   */
  plan(session, goal, allowSqueeze) {
    const runtime = session.runtime;
    return planMovement({
      start: session.origin,
      goal,
      walls: session.walls,
      normalRadius: session.footprint.normalRadius,
      squeezeRadius: session.footprint.squeezeRadius,
      enemies: session.enemies,
      budget: session.budget,
      unitsPerPixel: runtime.unitsPerPixel,
      squeezeMultiplier: runtime.squeezeMultiplier,
      allowSqueeze,
      markerDiameter: runtime.markerDiameter,
      markerBackoff: runtime.markerBackoff,
      epsilon: 0.5
    });
  }

  /**
   * Cursor-over-enemy perimeter rotation.
   * @param {object} session
   * @param {{x: number, y: number}} cursor
   * @param {Array<{id: string, center: {x: number, y: number}, radius: number}>} enemies
   * @param {import("../core/walls.mjs").WallSegment[]} walls
   */
  tryRotation(session, cursor, enemies, walls) {
    const current = session.appliedCenter;
    const movingRadius = session.footprint.normalRadius;
    const touching = enemies.filter((enemy) => isTouchingEnemy(current, enemy, movingRadius, CONTACT_TOLERANCE));
    const candidate = findEnemyUnderCursor(touching, cursor);
    if (!candidate) return null;

    if (session.rotationEnemyId !== candidate.id) {
      session.rotationEnemyId = candidate.id;
      session.rotationAngle = angleOf({
        x: current.x - candidate.center.x,
        y: current.y - candidate.center.y
      });
    }

    const contactDistance = movingRadius + candidate.radius;
    const isValid = (position) => {
      if (clearanceAtPoint(position, walls) < movingRadius - 0.75) return false;
      for (const enemy of enemies) {
        if (enemy.id === candidate.id) continue;
        if (distance(position, enemy.center) < movingRadius + enemy.radius - 1) return false;
      }
      return true;
    };

    const rotation = resolveRotation({
      enemy: candidate,
      cursor,
      movingRadius,
      lastAngle: session.rotationAngle,
      isPositionValid: isValid,
      step: ROTATION_STEP
    });
    if (!rotation) return null;

    const previousAngle = session.rotationAngle ?? rotation.angle;
    const arcPoints = buildArcPoints(candidate.center, contactDistance, previousAngle, rotation.angle);
    const arcLength = Math.abs(angleDelta(previousAngle, rotation.angle)) * contactDistance;
    const sceneDistance = arcLength * session.runtime.unitsPerPixel;
    session.rotationAngle = rotation.angle;

    const plan = {
      status: "normal",
      routeMode: "rotation",
      complete: true,
      start: session.origin,
      goal: cursor,
      points: arcPoints,
      segments: null,
      normal: { points: arcPoints, complete: true, reachable: true },
      normalReachable: true,
      squeezeReachable: false,
      markers: [],
      squeezeRuns: [],
      contact: { enemyId: candidate.id, point: rotation.point, distanceAlong: 0 },
      budgetExhausted: false,
      endpoint: rotation.point,
      totalDistance: sceneDistance,
      totalCost: sceneDistance,
      squeezeDistance: 0,
      normalDistance: sceneDistance,
      blockedDistance: 0,
      physicalDistancePx: arcLength,
      unitsPerPixel: session.runtime.unitsPerPixel,
      normalRadius: movingRadius,
      squeezeRadius: session.footprint.squeezeRadius,
      rotation: {
        enemyId: candidate.id,
        angle: rotation.angle,
        clamped: rotation.clamped
      }
    };

    return { plan, executedPlan: plan, appliedCenter: rotation.point };
  }

  /** @param {object} token */
  beforeDrop(token) {
    const session = this.session;
    if (!session || session.token !== token) return;
    this.applyCenter(session, session.appliedCenter);
  }

  /**
   * @param {object} token
   * @param {{verify?: boolean}} [options]
   */
  afterDrop(token, { verify = false } = {}) {
    const session = this.session;
    if (!session || session.token !== token) return;

    const executed = session.executedPlan;
    if (executed) {
      const extra = Math.max(0, (Number(executed.totalCost) || 0) - (Number(executed.totalDistance) || 0));
      if (extra > 0) {
        this.ledger.add(token, session.movement.action, extra);
        debugLog("recorded squeeze surcharge", { extra, action: session.movement.action });
      }
    }

    if (verify) this.verifyPlacement(session);
    this.endSession();
  }

  /**
   * Defensive check for async core drop implementations that might recompute a
   * destination from the pointer instead of the constrained position. The
   * primary integration still constrains during the drag; this only runs if the
   * committed document center disagrees, and is logged rather than hidden.
   * @param {object} session
   */
  verifyPlacement(session) {
    try {
      const current = getDocumentCenter(session.token);
      if (!current || distance(current, session.appliedCenter) <= 1.5) return;

      const sizePx = gridSize(globalThis.canvas?.scene);
      const width = Math.max(0.1, Number(session.token.document?.width) || 1) * sizePx;
      const height = Math.max(0.1, Number(session.token.document?.height) || 1) * sizePx;
      console.warn("Knkr Pathing | core drop committed an unconstrained position; applying the constrained position as a safety net", {
        committed: current,
        constrained: session.appliedCenter
      });
      session.token.document?.update?.({
        x: session.appliedCenter.x - width / 2,
        y: session.appliedCenter.y - height / 2
      })?.catch?.(() => {});
    } catch (error) {
      console.warn("Knkr Pathing | could not verify the dropped position", error);
    }
  }

  /** @param {object} token */
  onCancel(token) {
    if (this.session && this.session.token !== token) return;
    this.endSession();
  }

  endSession() {
    this.session = null;
    this.preview.clear();
  }

  /**
   * @param {object} session
   * @param {{x: number, y: number}} center
   */
  applyCenter(session, center) {
    if (!center || !Number.isFinite(center.x) || !Number.isFinite(center.y)) return;
    setTokenCenter(session.token, center);
    session.appliedCenter = center;
  }

  /** @param {unknown} error */
  handleError(error) {
    console.error("Knkr Pathing | drag planning failed", error);
    if (this.session) {
      try {
        // Never leave the token at the unconstrained cursor position.
        setTokenCenter(this.session.token, this.session.appliedCenter);
      } catch {
        // The token may already be gone (scene change).
      }
    }
    this.endSession();

    if (!this.errorNotified) {
      this.errorNotified = true;
      try {
        globalThis.ui?.notifications?.error(
          globalThis.game?.i18n?.format?.("KNKR_PATHING.Notifications.Incompatible", {
            reason: error instanceof Error ? error.message : String(error)
          }) ?? "Knkr Pathing disabled after a planning error."
        );
      } catch {
        // Notifications are best-effort.
      }
    }
  }
}

/**
 * Arc preview points around an enemy.
 * @param {{x: number, y: number}} center
 * @param {number} radius
 * @param {number} fromAngle
 * @param {number} toAngle
 */
function buildArcPoints(center, radius, fromAngle, toAngle) {
  const delta = angleDelta(fromAngle, toAngle);
  const steps = Math.max(1, Math.ceil(Math.abs(delta) / ROTATION_PREVIEW_STEP));
  const points = [];
  for (let index = 0; index <= steps; index += 1) {
    const angle = fromAngle + delta * (index / steps);
    points.push({
      x: center.x + Math.cos(angle) * radius,
      y: center.y + Math.sin(angle) * radius
    });
  }
  return points;
}
