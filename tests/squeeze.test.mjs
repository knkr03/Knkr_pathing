// AI notice: created with AI assistance (Freebuff / Codebuff). See NOTICE.md.
import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSqueezeMarkers,
  classifyGap,
  clearanceProfile,
  findSqueezeRuns,
  markerContainsPoint
} from "../src/core/squeeze.mjs";
import { extractBlockingWalls } from "../src/core/walls.mjs";
import { gapRoom } from "./helpers/scene.mjs";

test("gap classification uses both footprint thresholds", () => {
  assert.equal(classifyGap(120, 50, 25), "normal");
  assert.equal(classifyGap(50, 50, 25), "normal");
  assert.equal(classifyGap(40, 50, 25), "squeeze");
  assert.equal(classifyGap(25, 50, 25), "squeeze");
  assert.equal(classifyGap(20, 50, 25), "impassable");
});

test("clearance profile detects one squeeze run at an 80 px gap", () => {
  const walls = extractBlockingWalls(gapRoom(80));
  const points = [{ x: -400, y: 0 }, { x: 0, y: 0 }];
  const profile = clearanceProfile(points, walls, 4);
  const analysis = findSqueezeRuns(profile, { normalRadius: 50, squeezeRadius: 25, epsilon: 0.5, mergeGap: 8, step: 4 });

  assert.equal(analysis.invalid, false);
  assert.equal(analysis.runs.length, 1);
  const [run] = analysis.runs;
  assert.ok(run.minClearance > 38 && run.minClearance < 42);
  assert.ok(run.startDistance > 160 && run.startDistance < 180);
  assert.ok(run.endDistance > 220 && run.endDistance < 240);
});

test("runs separated by a short wide patch are merged", () => {
  const profile = [
    { x: 0, y: 0, distance: 0, clearance: 100 },
    { x: 10, y: 0, distance: 10, clearance: 40 },
    { x: 20, y: 0, distance: 20, clearance: 100 },
    { x: 30, y: 0, distance: 30, clearance: 40 },
    { x: 40, y: 0, distance: 40, clearance: 100 }
  ];
  const analysis = findSqueezeRuns(profile, {
    normalRadius: 50,
    squeezeRadius: 25,
    mergeGap: 25,
    step: 10
  });
  assert.equal(analysis.runs.length, 1);
  assert.equal(analysis.runs[0].startDistance, 10);
  assert.equal(analysis.runs[0].endDistance, 30);
});

test("paths narrower than the squeeze footprint are marked invalid", () => {
  const profile = [
    { x: 0, y: 0, distance: 0, clearance: 100 },
    { x: 10, y: 0, distance: 10, clearance: 20 },
    { x: 20, y: 0, distance: 20, clearance: 100 }
  ];
  const analysis = findSqueezeRuns(profile, { normalRadius: 50, squeezeRadius: 25 });
  assert.equal(analysis.invalid, true);
});

test("marker is placed before the passage in normal clearance and deduplicated", () => {
  const walls = extractBlockingWalls(gapRoom(80));
  const points = [{ x: -400, y: 0 }, { x: 0, y: 0 }];
  const profile = clearanceProfile(points, walls, 4);
  const analysis = findSqueezeRuns(profile, { normalRadius: 50, squeezeRadius: 25, mergeGap: 8, step: 4 });
  const markers = buildSqueezeMarkers(points, analysis.runs, {
    markerDiameter: 30,
    backoff: 30,
    minMarkerClearance: 50,
    walls
  });

  assert.equal(markers.length, 1);
  const marker = markers[0];
  assert.ok(marker.x < -230, "marker should be before the gap entrance");
  assert.ok(marker.radius === 15);
  assert.equal(markerContainsPoint({ x: marker.x + 10, y: marker.y }, marker, 6), true);
  assert.equal(markerContainsPoint({ x: marker.x + 40, y: marker.y }, marker, 6), false);

  const duplicates = buildSqueezeMarkers(points, [analysis.runs[0], { ...analysis.runs[0] }], {
    markerDiameter: 30,
    backoff: 30,
    walls
  });
  assert.equal(duplicates.length, 1);
});

test("markers beyond the route cutoff are removed", () => {
  const points = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 200, y: 0 }];
  const run = {
    startDistance: 150,
    endDistance: 170,
    minClearance: 40,
    entry: { x: 150, y: 0 },
    exit: { x: 170, y: 0 },
    neck: { x: 160, y: 0 },
    entryDistance: 150
  };
  const markers = buildSqueezeMarkers(points, [run], {
    markerDiameter: 20,
    backoff: 20,
    maxDistance: 120
  });
  assert.equal(markers.length, 0);
});
