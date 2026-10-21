/**
 * AI notice: created with AI assistance (Freebuff / Codebuff). See NOTICE.md.
 *
 * Gridless pathfinding for a circular token footprint.
 *
 * Blocking walls are modeled as capsules (wall segment expanded by the token
 * radius). Candidate waypoints are generated around expanded wall endpoints,
 * connected by visibility, and searched with A*. Straight sections and the
 * result are smoothed greedily. The direct start→goal segment is tested first.
 *
 * @typedef {{x: number, y: number}} Point
 * @typedef {import("./walls.mjs").WallSegment} WallSegment
 */

import { boundsContainsPoint, boundsIntersect, boundsOfPoints, expandBounds } from "./geometry.mjs";
import { clearanceAtPoint, filterWallsNear, nearestWalls, segmentClear } from "./walls.mjs";
import { distance } from "./vec.mjs";

const DEFAULT_MAX_WALLS = 32;
const DEFAULT_MAX_WAYPOINTS = 320;
const WAYPOINT_DIRECTIONS = 8;

/**
 * @param {object} options
 * @param {Point} options.start
 * @param {Point} options.goal
 * @param {number} options.radius Footprint radius in pixels.
 * @param {WallSegment[]} [options.walls]
 * @param {{minX: number, minY: number, maxX: number, maxY: number}} [options.bounds]
 * @param {number} [options.maxWalls]
 * @param {number} [options.maxWaypoints]
 * @param {number} [options.epsilon]
 * @returns {{points: Point[], complete: boolean, visited: number, waypoints: number, prunedWalls: number}}
 */
export function findPath({
  start,
  goal,
  radius,
  walls = [],
  bounds = null,
  maxWalls = DEFAULT_MAX_WALLS,
  maxWaypoints = DEFAULT_MAX_WAYPOINTS,
  epsilon = 0.5
}) {
  const startPoint = { x: start.x, y: start.y };
  const goalPoint = { x: goal.x, y: goal.y };
  const radiusValue = Math.max(0.5, Number(radius) || 0.5);
  const wallList = walls ?? [];

  if (distance(startPoint, goalPoint) < 1e-6) {
    return { points: [startPoint, goalPoint], complete: true, visited: 0, waypoints: 0, prunedWalls: 0 };
  }

  if (segmentClear(startPoint, goalPoint, radiusValue, wallList, epsilon)) {
    return {
      points: [startPoint, goalPoint],
      complete: true,
      visited: 0,
      waypoints: 0,
      prunedWalls: wallList.length
    };
  }

  // Expand the search region to include the endpoints of walls that block the
  // direct corridor. Otherwise a long barrier between start and goal would be
  // reported unreachable even though walking around its end is legal.
  const corridor = expandBounds(
    boundsOfPoints([startPoint, goalPoint]),
    Math.max(250, distance(startPoint, goalPoint) * 0.25) + radiusValue
  );
  const blockingNearCorridor = wallList.filter((wall) => boundsIntersect(wall.bbox, corridor));
  const anchors = [startPoint, goalPoint];
  for (const wall of blockingNearCorridor) anchors.push(wall.a, wall.b);
  const searchBounds = bounds
    ?? expandBounds(boundsOfPoints(anchors), Math.max(150, radiusValue * 2));

  // Collision tests use every wall near the search area, not just the subset
  // used to generate waypoints. A pruned wall must never be crossed silently.
  const collisionWalls = filterWallsNear(wallList, expandBounds(searchBounds, radiusValue + 1));
  const waypointWalls = nearestWalls(collisionWalls, startPoint, goalPoint, maxWalls);
  const generated = generateWaypoints(waypointWalls, radiusValue, searchBounds, epsilon, collisionWalls);

  if (generated.length > maxWaypoints) {
    generated
      .map((point, index) => ({
        point,
        index,
        score: distance(startPoint, point) + distance(point, goalPoint)
      }))
      .sort((first, second) => first.score - second.score || first.index - second.index)
      .slice(0, maxWaypoints)
      .sort((first, second) => first.index - second.index)
      .forEach((entry, index) => {
        generated[index] = entry.point;
      });
    generated.length = Math.min(generated.length, maxWaypoints);
  }

  const nodes = [startPoint, goalPoint, ...generated];
  const goalIndex = 1;
  const count = nodes.length;
  const gScore = new Float64Array(count).fill(Infinity);
  const cameFrom = new Int32Array(count).fill(-1);
  const closed = new Uint8Array(count);
  const heap = new MinHeap();

  gScore[0] = 0;
  heap.push(0, distance(startPoint, goalPoint));

  let reachedGoal = false;
  let visited = 0;

  while (heap.size > 0) {
    const current = heap.pop();
    if (closed[current.index]) continue;
    closed[current.index] = 1;
    visited += 1;

    if (current.index === goalIndex) {
      reachedGoal = true;
      break;
    }

    for (let next = 0; next < count; next += 1) {
      if (next === current.index || closed[next]) continue;
      if (!segmentClear(nodes[current.index], nodes[next], radiusValue, collisionWalls, epsilon)) continue;
      const tentative = gScore[current.index] + distance(nodes[current.index], nodes[next]);
      if (tentative + 1e-9 < gScore[next]) {
        gScore[next] = tentative;
        cameFrom[next] = current.index;
        heap.push(next, tentative + distance(nodes[next], goalPoint));
      }
    }
  }

  if (reachedGoal) {
    const raw = reconstruct(cameFrom, goalIndex);
    return {
      points: smooth(raw.map((index) => nodes[index]), radiusValue, collisionWalls, epsilon),
      complete: true,
      visited,
      waypoints: generated.length,
      prunedWalls: collisionWalls.length
    };
  }

  // No route: return the path to the reachable node that gets closest to the goal.
  let bestIndex = -1;
  let bestScore = Infinity;
  for (let index = 0; index < count; index += 1) {
    if (closed[index] && Number.isFinite(gScore[index])) {
      const score = gScore[index] + distance(nodes[index], goalPoint) * 1.0001;
      if (score < bestScore) {
        bestScore = score;
        bestIndex = index;
      }
    }
  }

  if (bestIndex <= 0) {
    return {
      points: [startPoint],
      complete: false,
      visited,
      waypoints: generated.length,
      prunedWalls: collisionWalls.length
    };
  }

  const partial = reconstruct(cameFrom, bestIndex);
  return {
    points: smooth(partial.map((index) => nodes[index]), radiusValue, collisionWalls, epsilon),
    complete: false,
    visited,
    waypoints: generated.length,
    prunedWalls: collisionWalls.length
  };
}

/**
 * Candidate waypoints around each expanded wall endpoint.
 * @param {WallSegment[]} walls
 * @param {number} radius
 * @param {{minX: number, minY: number, maxX: number, maxY: number}} bounds
 * @param {number} epsilon
 * @returns {Point[]}
 */
function generateWaypoints(walls, radius, bounds, epsilon, collisionWalls = walls) {
  const padding = Math.max(epsilon, 0.5) + 1;
  // Points exactly on the clearance circle cannot see each other: the chord
  // between two such points dips inside the capsule. A second, slightly wider
  // ring circumscribes the circle for the 8-way angular spacing, which lets the
  // graph round wall caps without cutting the corner. The tight ring is kept so
  // narrow squeeze passages still get usable waypoints.
  const tightOffset = radius + padding;
  const wideOffset = radius / Math.cos(Math.PI / WAYPOINT_DIRECTIONS) + padding;
  const offsets = [tightOffset, wideOffset];
  const candidates = [];
  const seen = new Set();

  for (const wall of walls) {
    for (const endpoint of [wall.a, wall.b]) {
      for (const offset of offsets) {
        for (let direction = 0; direction < WAYPOINT_DIRECTIONS; direction += 1) {
          const angle = (Math.PI * 2 * direction) / WAYPOINT_DIRECTIONS;
          const point = {
            x: endpoint.x + Math.cos(angle) * offset,
            y: endpoint.y + Math.sin(angle) * offset
          };
          if (!boundsContainsPoint(bounds, point)) continue;
          if (clearanceAtPoint(point, collisionWalls) < radius - epsilon) continue;
          const key = `${Math.round(point.x * 2)},${Math.round(point.y * 2)}`;
          if (seen.has(key)) continue;
          seen.add(key);
          candidates.push(point);
        }
      }
    }
  }

  return candidates;
}

/**
 * @param {Int32Array} cameFrom
 * @param {number} index
 * @returns {number[]}
 */
function reconstruct(cameFrom, index) {
  const indices = [index];
  let current = index;
  while (cameFrom[current] !== -1) {
    current = cameFrom[current];
    indices.push(current);
    if (indices.length > 10000) break;
  }
  return indices.reverse();
}

/**
 * Greedy line-of-sight smoothing.
 * @param {Point[]} points
 * @param {number} radius
 * @param {WallSegment[]} walls
 * @param {number} epsilon
 * @returns {Point[]}
 */
export function smooth(points, radius, walls, epsilon = 0.5) {
  if (points.length <= 2) return points.map((point) => ({ ...point }));

  const result = [points[0]];
  let anchor = 0;

  while (anchor < points.length - 1) {
    let next = points.length - 1;
    while (next > anchor + 1) {
      if (segmentClear(points[anchor], points[next], radius, walls, epsilon)) break;
      next -= 1;
    }
    result.push({ ...points[next] });
    anchor = next;
  }

  return result;
}

/** Binary min-heap with stale-entry tolerance. */
class MinHeap {
  constructor() {
    this.items = [];
  }

  get size() {
    return this.items.length;
  }

  push(index, score) {
    const item = { index, score };
    this.items.push(item);
    let child = this.items.length - 1;
    while (child > 0) {
      const parent = (child - 1) >> 1;
      if (this.items[parent].score <= this.items[child].score) break;
      [this.items[parent], this.items[child]] = [this.items[child], this.items[parent]];
      child = parent;
    }
  }

  pop() {
    const top = this.items[0];
    const last = this.items.pop();
    if (this.items.length > 0) {
      this.items[0] = last;
      let parent = 0;
      for (;;) {
        const left = parent * 2 + 1;
        const right = left + 1;
        let smallest = parent;
        if (left < this.items.length && this.items[left].score < this.items[smallest].score) smallest = left;
        if (right < this.items.length && this.items[right].score < this.items[smallest].score) smallest = right;
        if (smallest === parent) break;
        [this.items[parent], this.items[smallest]] = [this.items[smallest], this.items[parent]];
        parent = smallest;
      }
    }
    return top;
  }
}
