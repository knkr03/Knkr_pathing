/**
 * AI notice: created with AI assistance (Freebuff / Codebuff). See NOTICE.md.
 *
 * Movement planner: one call produces a complete, immutable plan for a drag
 * frame. It combines wall pathfinding, squeeze classification, hostile contact,
 * and movement-budget clamping.
 */

import { findPath } from "./pathfinder.mjs";
import { buildSqueezeMarkers, clearanceProfile, findSqueezeRuns } from "./squeeze.mjs";
import { buildSegments, clampSegmentsToBudget, summarizeSegments } from "./cost.mjs";
import { clampPolylineAtEnemies } from "./enemies.mjs";
import { boundsOfPoints, expandBounds, polylineLength, truncatePolyline } from "./geometry.mjs";
import { filterWallsNear } from "./walls.mjs";
import { distance } from "./vec.mjs";
import { PLAN_STATUS } from "../constants.mjs";

/**
 * @typedef {{x: number, y: number}} Point
 * @typedef {import("./walls.mjs").WallSegment} WallSegment
 * @typedef {import("./enemies.mjs").Enemy} Enemy
 */

/**
 * Plan a single movement.
 *
 * @param {object} options
 * @param {Point} options.start Drag origin in pixels.
 * @param {Point} options.goal Proposed destination in pixels.
 * @param {WallSegment[]} [options.walls] Blocking walls.
 * @param {number} options.normalRadius Normal footprint radius in pixels.
 * @param {number} [options.squeezeRadius] Reduced footprint radius in pixels.
 * @param {Enemy[]} [options.enemies] Eligible hostile enemies.
 * @param {number | null} [options.budget] Remaining movement in scene units.
 * @param {number} [options.unitsPerPixel] Scene units per pixel.
 * @param {number} [options.squeezeMultiplier]
 * @param {boolean} [options.allowSqueeze]
 * @param {number} [options.markerDiameter] Squeeze marker diameter in pixels.
 * @param {number} [options.markerBackoff] Marker distance before the passage in pixels.
 * @param {number} [options.epsilon]
 * @param {number} [options.maxWalls]
 * @param {number} [options.maxWaypoints]
 * @param {number} [options.profileStep] Clearance sampling step in pixels.
 * @returns {object}
 */
export function planMovement({
  start,
  goal,
  walls = [],
  normalRadius,
  squeezeRadius,
  enemies = [],
  budget = null,
  unitsPerPixel = 1,
  squeezeMultiplier = 2,
  allowSqueeze = true,
  markerDiameter = 20,
  markerBackoff = markerDiameter,
  epsilon = 0.5,
  maxWalls,
  maxWaypoints,
  profileStep = 6
}) {
  if (!isFinitePoint(start) || !isFinitePoint(goal)) {
    throw new TypeError("planMovement requires finite start and goal points");
  }

  const factor = Number(unitsPerPixel) > 0 ? Number(unitsPerPixel) : 1;
  const normal = Math.max(0.5, Number(normalRadius) || 0.5);
  const squeeze = Math.min(normal, Math.max(0.5, Number(squeezeRadius) || normal * 0.5));
  const canSqueeze = allowSqueeze !== false && squeeze < normal - 1e-6;
  const searchOptions = { epsilon, maxWalls, maxWaypoints };

  const normalPath = findPath({
    start,
    goal,
    radius: normal,
    walls,
    ...searchOptions
  });

  let routeMode = normalPath.complete ? "normal" : "impassable";
  let routePoints = normalPath.points;
  let planWalls = [];
  let squeezePath = null;
  let squeezeAnalysis = null;
  let squeezeRuns = [];

  if (!normalPath.complete && canSqueeze) {
    squeezePath = findPath({
      start,
      goal,
      radius: squeeze,
      walls,
      ...searchOptions
    });

    if (squeezePath.complete) {
      planWalls = wallsNearRoute(walls, start, goal, squeezePath.points, normal);
      const profile = clearanceProfile(squeezePath.points, planWalls, profileStep);
      squeezeAnalysis = findSqueezeRuns(profile, {
        normalRadius: normal,
        squeezeRadius: squeeze,
        epsilon,
        mergeGap: Math.max(profileStep * 2, 12),
        step: profileStep
      });

      if (!squeezeAnalysis.invalid) {
        routeMode = "squeeze";
        routePoints = squeezePath.points;
        squeezeRuns = squeezeAnalysis.runs;
      }
    }
  }

  if (routeMode !== "squeeze") {
    routePoints = normalPath.points;
    planWalls = wallsNearRoute(walls, start, goal, routePoints, normal);
  }

  const contactRadius = routeMode === "squeeze" ? squeeze : normal;
  const enemyClamp = clampPolylineAtEnemies(routePoints, {
    movingRadius: contactRadius,
    enemies,
    epsilon
  });

  let points = enemyClamp.points;
  let contact = enemyClamp.contact;
  let segments = buildSegments(points, {
    walls: planWalls,
    normalRadius: normal,
    squeezeRadius: squeeze,
    squeezeMultiplier,
    unitsPerPixel: factor,
    epsilon
  });

  const budgetUnits = budget == null || !Number.isFinite(Number(budget))
    ? null
    : Math.max(0, Number(budget));

  const clamped = clampSegmentsToBudget(segments, budgetUnits);
  segments = clamped.segments;
  const finalDistance = clamped.travelledDistance;

  if (budgetUnits != null) {
    points = truncatePolyline(points, finalDistance);
  }

  if (contact && contact.distanceAlong > finalDistance + 0.5) {
    contact = null;
  }

  const markers = routeMode === "squeeze" && squeezeAnalysis && !squeezeAnalysis.invalid
    ? buildSqueezeMarkers(routePoints, squeezeRuns, {
      markerDiameter,
      backoff: markerBackoff,
      minMarkerClearance: normal,
      walls: planWalls,
      maxDistance: finalDistance
    })
    : [];

  squeezeRuns = squeezeRuns.filter((run) => run.startDistance <= finalDistance + 0.5);

  const summary = summarizeSegments(segments);
  const baseStatus = routeMode === "normal" ? PLAN_STATUS.normal : routeMode === "squeeze" ? PLAN_STATUS.squeeze : PLAN_STATUS.impassable;

  let status = baseStatus;
  if (contact) status = PLAN_STATUS.contact;
  else if (baseStatus === PLAN_STATUS.impassable) status = PLAN_STATUS.impassable;
  else if (clamped.exhausted) status = PLAN_STATUS.budget;

  const endpoint = points[points.length - 1] ?? { ...start };
  const complete = baseStatus !== PLAN_STATUS.impassable
    && !contact
    && !clamped.exhausted
    && distance(endpoint, goal) <= 0.5;

  return {
    status,
    routeMode,
    complete,
    start: { ...start },
    goal: { ...goal },
    points,
    segments,
    normal: {
      points: normalPath.points,
      complete: normalPath.complete,
      reachable: normalPath.complete
    },
    squeezePath: squeezePath ? { points: squeezePath.points, complete: squeezePath.complete } : null,
    normalReachable: normalPath.complete,
    squeezeReachable: Boolean(squeezePath?.complete) && routeMode === "squeeze",
    squeezeRuns,
    markers,
    contact,
    budgetExhausted: clamped.exhausted,
    endpoint,
    totalDistance: summary.distance,
    totalCost: summary.cost,
    squeezeDistance: summary.squeezeDistance,
    normalDistance: summary.normalDistance,
    blockedDistance: summary.blockedDistance,
    physicalDistancePx: polylineLength(points),
    unitsPerPixel: factor,
    normalRadius: normal,
    squeezeRadius: squeeze,
    debug: {
      normalVisited: normalPath.visited,
      squeezeVisited: squeezePath?.visited ?? 0,
      waypoints: normalPath.waypoints + (squeezePath?.waypoints ?? 0),
      prunedWalls: normalPath.prunedWalls
    }
  };
}

/**
 * Walls that can affect a route: everything whose bounds intersect the route
 * bounds expanded by the token radius. Walls outside this region cannot be
 * crossed by a path that stays inside it.
 * @param {WallSegment[]} walls
 * @param {Point} start
 * @param {Point} goal
 * @param {Point[]} routePoints
 * @param {number} radius
 */
function wallsNearRoute(walls, start, goal, routePoints, radius) {
  if (!walls.length) return [];
  const bounds = expandBounds(boundsOfPoints([start, goal, ...routePoints]), radius + 8);
  return filterWallsNear(walls, bounds);
}

/** @param {Point} point */
function isFinitePoint(point) {
  return Boolean(point) && Number.isFinite(point.x) && Number.isFinite(point.y);
}
