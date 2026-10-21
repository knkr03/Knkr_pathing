/**
 * AI notice: created with AI assistance (Freebuff / Codebuff). See NOTICE.md.
 *
 * Squeeze-gap analysis: find the runs along a path where the token needs the
 * reduced footprint, and place interaction markers before each entrance.
 */

import { pointAtDistance, samplePolyline } from "./geometry.mjs";
import { clearanceAtPoint, segmentMinClearance } from "./walls.mjs";
import { distance } from "./vec.mjs";

/**
 * @typedef {{x: number, y: number}} Point
 * @typedef {{startDistance: number, endDistance: number, minClearance: number,
 *   entry: Point, exit: Point, neck: Point, entryDistance: number}} SqueezeRun
 * @typedef {{x: number, y: number, radius: number, run: SqueezeRun, entry: Point}} SqueezeMarker
 */

/**
 * Clearance along a polyline at a fixed sampling step.
 * @param {Point[]} points
 * @param {import("./walls.mjs").WallSegment[]} walls
 * @param {number} step
 * @returns {Array<{x: number, y: number, distance: number, clearance: number}>}
 */
export function clearanceProfile(points, walls, step = 6) {
  return samplePolyline(points, step).map((sample) => ({
    x: sample.x,
    y: sample.y,
    distance: sample.distance,
    clearance: clearanceAtPoint({ x: sample.x, y: sample.y }, walls)
  }));
}

/**
 * Find contiguous sections where clearance is below the normal footprint but
 * at or above the squeeze footprint.
 *
 * @param {Array<{x: number, y: number, distance: number, clearance: number}>} profile
 * @param {object} options
 * @param {number} options.normalRadius
 * @param {number} options.squeezeRadius
 * @param {number} [options.epsilon]
 * @param {number} [options.mergeGap] Distance under which two runs are merged.
 * @param {number} [options.step]
 * @returns {{runs: SqueezeRun[], invalid: boolean, minClearance: number}}
 */
export function findSqueezeRuns(profile, {
  normalRadius,
  squeezeRadius,
  epsilon = 0.5,
  mergeGap = 12,
  step = 6
}) {
  const runs = [];
  const threshold = normalRadius - epsilon;
  let invalid = false;
  let minClearance = Infinity;

  let current = null;
  for (const sample of profile) {
    minClearance = Math.min(minClearance, sample.clearance);
    if (sample.clearance < squeezeRadius - epsilon) invalid = true;

    const narrow = sample.clearance < threshold;
    if (narrow) {
      if (!current) {
        current = {
          startDistance: sample.distance,
          endDistance: sample.distance,
          minClearance: sample.clearance,
          entry: { x: sample.x, y: sample.y },
          exit: { x: sample.x, y: sample.y },
          neck: { x: sample.x, y: sample.y },
          entryDistance: sample.distance
        };
      } else {
        current.endDistance = sample.distance;
        current.exit = { x: sample.x, y: sample.y };
        if (sample.clearance < current.minClearance) {
          current.minClearance = sample.clearance;
          current.neck = { x: sample.x, y: sample.y };
        }
      }
    } else if (current) {
      runs.push(current);
      current = null;
    }
  }
  if (current) runs.push(current);

  // Merge runs separated by a short wide patch (for example a thick door frame).
  const merged = [];
  for (const run of runs) {
    const previous = merged[merged.length - 1];
    if (previous && run.startDistance - previous.endDistance <= mergeGap) {
      previous.endDistance = run.endDistance;
      previous.exit = run.exit;
      if (run.minClearance < previous.minClearance) {
        previous.minClearance = run.minClearance;
        previous.neck = run.neck;
      }
    } else {
      merged.push({ ...run });
    }
  }

  // A squeeze route should always contain at least one narrow section. If the
  // geometry is too irregular for the clearance samples, fall back to the
  // tightest sampled point so the interaction remains possible instead of
  // silently denying a route the planner proved valid.
  if (merged.length === 0 && profile.length > 0 && minClearance < normalRadius + step) {
    let tightest = profile[0];
    for (const sample of profile) {
      if (sample.clearance < tightest.clearance) tightest = sample;
    }
    merged.push({
      startDistance: Math.max(0, tightest.distance - step),
      endDistance: tightest.distance + step,
      minClearance: tightest.clearance,
      entry: { x: tightest.x, y: tightest.y },
      exit: { x: tightest.x, y: tightest.y },
      neck: { x: tightest.x, y: tightest.y },
      entryDistance: tightest.distance
    });
  }

  return { runs: merged, invalid, minClearance };
}

/**
 * Place a marker before each squeeze run so the token can target it without
 * entering the gap. Markers that land in the same passage are deduplicated.
 *
 * @param {Point[]} points
 * @param {SqueezeRun[]} runs
 * @param {object} options
 * @param {number} options.markerDiameter Pixels.
 * @param {number} [options.backoff] Pixels before the run entrance.
 * @param {number} [options.minMarkerClearance] Clearance the marker should sit in; usually normalRadius.
 * @param {import("./walls.mjs").WallSegment[]} [options.walls]
 * @param {number} [options.maxDistance] Only keep markers for runs starting before this route distance.
 * @returns {SqueezeMarker[]}
 */
export function buildSqueezeMarkers(points, runs, {
  markerDiameter,
  backoff = markerDiameter,
  minMarkerClearance = null,
  walls = [],
  maxDistance = Infinity
}) {
  const radius = markerDiameter / 2;
  const markers = [];

  for (const run of runs) {
    let markerDistance = Math.max(0, run.startDistance - backoff);

    if (minMarkerClearance != null && walls.length > 0) {
      // Walk backwards until the marker sits in normal-clearance space, but
      // never push it behind the start of the path.
      let position = pointAtDistance(points, markerDistance);
      let guard = 0;
      while (position && clearanceAtPoint(position.point, walls) < minMarkerClearance - 0.5 && markerDistance > 0 && guard < 200) {
        markerDistance = Math.max(0, markerDistance - 4);
        position = pointAtDistance(points, markerDistance);
        guard += 1;
      }
    }

    const position = pointAtDistance(points, markerDistance);
    if (!position) continue;
    const marker = {
      x: position.point.x,
      y: position.point.y,
      radius,
      run,
      entry: { ...run.entry }
    };

    const duplicate = markers.some((existing) =>
      distance(existing, marker) < Math.max(radius, markerDiameter * 0.75)
    );
    if (!duplicate) markers.push(marker);
  }

  // Keep markers that lie before the final destination; a marker beyond a
  // truncated route (enemy contact or budget) is not actionable.
  return markers.filter((marker) => marker.run.startDistance <= maxDistance + 0.5);
}

/**
 * Distance from a point to the entrance of a squeeze run.
 * @param {Point} point
 * @param {SqueezeMarker} marker
 */
export function distanceToMarker(point, marker) {
  return distance(point, marker);
}

/**
 * Whether a marker is currently within its activation area.
 * @param {Point} point
 * @param {SqueezeMarker} marker
 * @param {number} [padding] Extra activation padding in pixels.
 */
export function markerContainsPoint(point, marker, padding = 0) {
  return distance(point, marker) <= marker.radius + padding;
}

/**
 * Classify a gap width for tests and diagnostics.
 * @param {number} width Gap clearance in pixels.
 * @param {number} normalRadius
 * @param {number} squeezeRadius
 * @param {number} [epsilon]
 * @returns {"normal" | "squeeze" | "impassable"}
 */
export function classifyGap(width, normalRadius, squeezeRadius, epsilon = 0.5) {
  if (width >= normalRadius - epsilon) return "normal";
  if (width >= squeezeRadius - epsilon) return "squeeze";
  return "impassable";
}

/**
 * Minimum clearance across a polyline, exact per segment.
 * @param {Point[]} points
 * @param {import("./walls.mjs").WallSegment[]} walls
 */
export function pathMinClearance(points, walls) {
  let minimum = Infinity;
  for (let index = 1; index < points.length; index += 1) {
    minimum = Math.min(minimum, segmentMinClearance(points[index - 1], points[index], walls));
  }
  return minimum;
}

