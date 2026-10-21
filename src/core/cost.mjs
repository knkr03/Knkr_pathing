/**
 * AI notice: created with AI assistance (Freebuff / Codebuff). See NOTICE.md.
 *
 * Per-segment movement accounting. The physical length and the movement cost
 * are tracked separately. Path segments are subdivided wherever the footprint
 * clearance crosses the normal or squeeze threshold, so the squeeze multiplier
 * applies only to the narrow portion of a route — not to a whole straight
 * segment that happens to pass through one gap.
 */

import { distance, lerp } from "./vec.mjs";
import { pointSegmentDistance } from "./geometry.mjs";
import { SEGMENT_MODE } from "../constants.mjs";

/**
 * @typedef {{x: number, y: number}} Point
 * @typedef {object} PathSegment
 * @property {Point} a
 * @property {Point} b
 * @property {number} distancePx
 * @property {number} distance Scene units.
 * @property {number} multiplier
 * @property {number} cost Scene units.
 * @property {"normal" | "squeeze" | "blocked"} mode
 * @property {number} clearance Pixels (minimum for this piece).
 */

/**
 * Build costed segments from a polyline, subdividing at clearance transitions.
 *
 * @param {Point[]} points
 * @param {object} options
 * @param {import("./walls.mjs").WallSegment[]} [options.walls]
 * @param {number} options.normalRadius
 * @param {number} options.squeezeRadius
 * @param {number} [options.squeezeMultiplier]
 * @param {number} [options.unitsPerPixel]
 * @param {number} [options.epsilon]
 * @param {number} [options.step] Maximum subdivision step in pixels.
 * @returns {PathSegment[]}
 */
export function buildSegments(points, {
  walls = [],
  normalRadius,
  squeezeRadius,
  squeezeMultiplier = 2,
  unitsPerPixel = 1,
  epsilon = 0.5,
  step = null
}) {
  const factor = Number(unitsPerPixel) > 0 ? Number(unitsPerPixel) : 1;
  const multiplier = Math.max(1, Number(squeezeMultiplier) || 2);
  const normal = Math.max(0.5, Number(normalRadius) || 0.5);
  const squeeze = Math.min(normal, Math.max(0.5, Number(squeezeRadius) || normal * 0.5));
  const subdivision = Math.max(2, Math.min(12, Number(step) || Math.min(normal, squeeze) / 4 || 4));

  if (!points || points.length < 2) return [];
  if (!walls.length) {
    return points.slice(1).map((end, index) => makeSegment(points[index], end, SEGMENT_MODE.normal, Infinity, multiplier, factor));
  }

  const clearanceAlong = (a, b, t) => {
    const point = lerp(a, b, t);
    let minimum = Infinity;
    for (const wall of walls) {
      const value = pointSegmentDistance(point, wall.a, wall.b);
      if (value < minimum) minimum = value;
    }
    return minimum;
  };

  const stateFor = (clearance) => {
    if (clearance >= normal - epsilon) return SEGMENT_MODE.normal;
    if (clearance >= squeeze - epsilon) return SEGMENT_MODE.squeeze;
    return SEGMENT_MODE.blocked;
  };

  const thresholdFor = (stateA, stateB) => {
    if (stateA === SEGMENT_MODE.blocked || stateB === SEGMENT_MODE.blocked) {
      // Boundary between squeeze and blocked uses the squeeze threshold unless
      // the normal side is involved.
      if (stateA === SEGMENT_MODE.normal || stateB === SEGMENT_MODE.normal) return normal - epsilon;
      return squeeze - epsilon;
    }
    return normal - epsilon;
  };

  const refine = (a, b, tLow, tHigh, clearanceLow, clearanceHigh, threshold) => {
    let low = tLow;
    let high = tHigh;
    let fLow = clearanceLow - threshold;
    const fHigh = clearanceHigh - threshold;
    if (fLow === 0) return low;
    if (fHigh === 0) return high;
    if (fLow * fHigh > 0) return (low + high) / 2;

    for (let iteration = 0; iteration < 14; iteration += 1) {
      const mid = (low + high) / 2;
      const fMid = clearanceAlong(a, b, mid) - threshold;
      if (fLow * fMid <= 0) {
        high = mid;
      } else {
        low = mid;
        fLow = fMid;
      }
    }
    return (low + high) / 2;
  };

  const pieces = [];

  for (let index = 1; index < points.length; index += 1) {
    const a = points[index - 1];
    const b = points[index];
    const lengthPx = distance(a, b);
    if (lengthPx < 1e-6) continue;

    const divisions = Math.max(1, Math.ceil(lengthPx / subdivision));
    const samples = [];
    for (let sample = 0; sample <= divisions; sample += 1) {
      const t = sample / divisions;
      const clearance = clearanceAlong(a, b, t);
      samples.push({ t, clearance, state: stateFor(clearance) });
    }

    // Refine boundaries between adjacent samples, then collect runs.
    const boundaries = [{ t: 0, state: samples[0].state }];
    for (let sample = 1; sample < samples.length; sample += 1) {
      const previous = samples[sample - 1];
      const current = samples[sample];
      if (current.state === previous.state) continue;
      const threshold = thresholdFor(previous.state, current.state);
      const t = refine(a, b, previous.t, current.t, previous.clearance, current.clearance, threshold);
      boundaries.push({ t, state: previous.state });
      boundaries.push({ t, state: current.state });
    }
    boundaries.push({ t: 1, state: samples[samples.length - 1].state });

    for (let boundary = 1; boundary < boundaries.length; boundary += 1) {
      const start = boundaries[boundary - 1];
      const end = boundaries[boundary];
      if (end.t - start.t < 1e-9) continue;
      const startPoint = lerp(a, b, start.t);
      const endPoint = lerp(a, b, end.t);
      const pieceLength = distance(startPoint, endPoint);
      if (pieceLength < 1e-6) continue;
      const minClearance = Math.min(
        clearanceAlong(a, b, start.t),
        clearanceAlong(a, b, (start.t + end.t) / 2),
        clearanceAlong(a, b, end.t)
      );
      pieces.push(makeSegment(startPoint, endPoint, start.state, minClearance, multiplier, factor));
    }
  }

  return mergeAdjacent(pieces);
}

/**
 * @param {Point} a @param {Point} b @param {string} mode @param {number} clearance
 * @param {number} multiplier @param {number} unitsPerPixel
 * @returns {PathSegment}
 */
function makeSegment(a, b, mode, clearance, multiplier, unitsPerPixel) {
  const distancePx = distance(a, b);
  const sceneDistance = distancePx * unitsPerPixel;
  const segmentMultiplier = mode === SEGMENT_MODE.squeeze ? multiplier : 1;
  return {
    a: { x: a.x, y: a.y },
    b: { x: b.x, y: b.y },
    distancePx,
    distance: sceneDistance,
    multiplier: segmentMultiplier,
    cost: sceneDistance * segmentMultiplier,
    mode,
    clearance
  };
}

/**
 * Merge adjacent pieces with the same mode and multiplier.
 * @param {PathSegment[]} pieces
 * @returns {PathSegment[]}
 */
function mergeAdjacent(pieces) {
  const merged = [];
  for (const piece of pieces) {
    const previous = merged[merged.length - 1];
    if (previous && previous.mode === piece.mode && Math.abs(previous.multiplier - piece.multiplier) < 1e-9) {
      previous.b = { ...piece.b };
      previous.distancePx += piece.distancePx;
      previous.distance += piece.distance;
      previous.cost += piece.cost;
      previous.clearance = Math.min(previous.clearance, piece.clearance);
      continue;
    }
    merged.push({ ...piece, a: { ...piece.a }, b: { ...piece.b } });
  }
  return merged;
}

/**
 * Totals for a set of segments.
 * @param {PathSegment[]} segments
 */
export function summarizeSegments(segments) {
  let distance = 0;
  let cost = 0;
  let squeezeDistance = 0;
  let normalDistance = 0;
  let blockedDistance = 0;

  for (const segment of segments) {
    distance += segment.distance;
    cost += segment.cost;
    if (segment.mode === SEGMENT_MODE.squeeze) squeezeDistance += segment.distance;
    else if (segment.mode === SEGMENT_MODE.blocked) blockedDistance += segment.distance;
    else normalDistance += segment.distance;
  }

  return { distance, cost, squeezeDistance, normalDistance, blockedDistance };
}

/**
 * Truncate a costed route at a movement-cost budget.
 * @param {PathSegment[]} segments
 * @param {number | null} budget Scene units. Null or Infinity means no limit.
 * @param {number} [epsilon]
 * @returns {{
 *   segments: PathSegment[],
 *   travelledDistance: number,
 *   spent: number,
 *   exhausted: boolean,
 *   endpoint: Point | null
 * }}
 */
export function clampSegmentsToBudget(segments, budget, epsilon = 1e-7) {
  if (budget == null || !Number.isFinite(budget)) {
    const spent = segments.reduce((total, segment) => total + segment.cost, 0);
    return {
      segments: segments.map((segment) => ({ ...segment })),
      travelledDistance: segments.reduce((total, segment) => total + segment.distancePx, 0),
      spent,
      exhausted: false,
      endpoint: segments.length > 0 ? { ...segments[segments.length - 1].b } : null
    };
  }

  const available = Math.max(0, Number(budget) || 0);
  const result = [];
  let spent = 0;
  let travelledDistance = 0;
  let endpoint = segments.length > 0 ? { ...segments[0].a } : null;

  for (const segment of segments) {
    const remaining = available - spent;
    if (remaining <= epsilon) {
      return { segments: result, travelledDistance, spent, exhausted: true, endpoint };
    }

    if (segment.cost <= remaining + epsilon) {
      result.push({ ...segment });
      spent += segment.cost;
      travelledDistance += segment.distancePx;
      endpoint = { ...segment.b };
      continue;
    }

    const t = segment.cost < epsilon ? 0 : Math.max(0, Math.min(1, remaining / segment.cost));
    const partial = {
      ...segment,
      b: lerp(segment.a, segment.b, t),
      distancePx: segment.distancePx * t,
      distance: segment.distance * t,
      cost: segment.cost * t
    };
    if (partial.distancePx > epsilon) result.push(partial);
    spent += partial.cost;
    travelledDistance += partial.distancePx;
    endpoint = { ...partial.b };

    return { segments: result, travelledDistance, spent, exhausted: true, endpoint };
  }

  return { segments: result, travelledDistance, spent, exhausted: false, endpoint };
}

/**
 * Cost of a physical distance at a given multiplier.
 * @param {number} distance
 * @param {number} [multiplier]
 */
export function movementCost(distance, multiplier = 1) {
  return Math.max(0, Number(distance) || 0) * Math.max(1, Number(multiplier) || 1);
}
