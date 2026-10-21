// AI notice: created with AI assistance (Freebuff / Codebuff). See NOTICE.md.
import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSegments,
  clampSegmentsToBudget,
  summarizeSegments
} from "../src/core/cost.mjs";
import { extractBlockingWalls } from "../src/core/walls.mjs";
import { gapRoom } from "./helpers/scene.mjs";

const walls = extractBlockingWalls(gapRoom(80));
const points = [{ x: -400, y: 0 }, { x: 0, y: 0 }];

test("only the narrow portion of a straight route is squeezed", () => {
  const segments = buildSegments(points, {
    walls,
    normalRadius: 50,
    squeezeRadius: 25,
    squeezeMultiplier: 2,
    unitsPerPixel: 0.05,
    step: 4
  });
  const summary = summarizeSegments(segments);

  assert.ok(summary.squeezeDistance > 2, `squeeze distance too small: ${summary.squeezeDistance}`);
  assert.ok(summary.squeezeDistance < 4, `squeeze distance too large: ${summary.squeezeDistance}`);
  assert.ok(Math.abs(summary.distance - 20) < 0.01, "physical distance should be 20 ft");
  assert.ok(
    Math.abs(summary.cost - (summary.distance + summary.squeezeDistance)) < 0.0001,
    "cost = normal + squeeze x2"
  );
  assert.ok(Math.abs(summary.cost - 23) < 1, "cost should be roughly 23 ft");
});

test("wide passage costs only physical distance", () => {
  const wideWalls = extractBlockingWalls(gapRoom(200));
  const segments = buildSegments(points, {
    walls: wideWalls,
    normalRadius: 50,
    squeezeRadius: 25,
    unitsPerPixel: 0.05
  });
  const summary = summarizeSegments(segments);
  assert.equal(summary.squeezeDistance, 0);
  assert.ok(Math.abs(summary.cost - summary.distance) < 1e-9);
});

test("no walls means normal movement only", () => {
  const segments = buildSegments(points, {
    normalRadius: 50,
    squeezeRadius: 25,
    unitsPerPixel: 0.05
  });
  assert.equal(segments.length, 1);
  assert.equal(segments[0].mode, "normal");
  assert.equal(segments[0].multiplier, 1);
});

test("budget clamps mid-segment and reports exhaustion", () => {
  const segments = buildSegments(points, {
    walls,
    normalRadius: 50,
    squeezeRadius: 25,
    unitsPerPixel: 0.05
  });
  const totalCost = summarizeSegments(segments).cost;
  const clamped = clampSegmentsToBudget(segments, totalCost - 1);

  assert.equal(clamped.exhausted, true);
  assert.ok(clamped.spent <= totalCost - 1 + 1e-6);
  assert.ok(clamped.endpoint.x < 0);
  assert.ok(Math.abs(clamped.spent - (totalCost - 1)) < 0.01);
});

test("budget returns the start when no movement is affordable", () => {
  const segments = buildSegments(points, {
    walls,
    normalRadius: 50,
    squeezeRadius: 25,
    unitsPerPixel: 0.05
  });
  const clamped = clampSegmentsToBudget(segments, 0);
  assert.equal(clamped.exhausted, true);
  assert.equal(clamped.segments.length, 0);
  assert.deepEqual(clamped.endpoint, { x: -400, y: 0 });
});

test("unlimited budget leaves the route intact", () => {
  const segments = buildSegments(points, {
    walls,
    normalRadius: 50,
    squeezeRadius: 25,
    unitsPerPixel: 0.05
  });
  const clamped = clampSegmentsToBudget(segments, null);
  assert.equal(clamped.exhausted, false);
  assert.deepEqual(clamped.endpoint, { x: 0, y: 0 });
});
