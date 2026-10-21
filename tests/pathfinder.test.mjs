// AI notice: created with AI assistance (Freebuff / Codebuff). See NOTICE.md.
import assert from "node:assert/strict";
import test from "node:test";
import { findPath } from "../src/core/pathfinder.mjs";
import { segmentMinClearance } from "../src/core/walls.mjs";
import { polylineLength } from "../src/core/geometry.mjs";
import { extractBlockingWalls } from "../src/core/walls.mjs";
import { closedRoom, gapRoom, gapWalls, wall } from "./helpers/scene.mjs";

function clearanceOfPath(points, walls) {
  let minimum = Infinity;
  for (let index = 1; index < points.length; index += 1) {
    minimum = Math.min(minimum, segmentMinClearance(points[index - 1], points[index], walls));
  }
  return minimum;
}

test("direct path is returned when unobstructed", () => {
  const result = findPath({
    start: { x: 0, y: 0 },
    goal: { x: 300, y: 100 },
    radius: 50,
    walls: []
  });
  assert.equal(result.complete, true);
  assert.deepEqual(result.points, [{ x: 0, y: 0 }, { x: 300, y: 100 }]);
});

test("routes around a single wall corner with full clearance", () => {
  const walls = extractBlockingWalls([wall(0, -200, 0, 200)]);
  const result = findPath({
    start: { x: -200, y: 0 },
    goal: { x: 300, y: 0 },
    radius: 40,
    walls
  });

  assert.equal(result.complete, true);
  assert.ok(result.points.length >= 3, "expected at least one waypoint");
  assert.ok(polylineLength(result.points) > 500, "route should bend around the wall");
  assert.ok(clearanceOfPath(result.points, walls) >= 39.4, "route must not cross the wall");
});

test("passes through a normal-width opening", () => {
  const walls = extractBlockingWalls(gapRoom(140));
  const result = findPath({
    start: { x: -400, y: 0 },
    goal: { x: 0, y: 0 },
    radius: 50,
    walls
  });
  assert.equal(result.complete, true);
  assert.deepEqual(result.points, [{ x: -400, y: 0 }, { x: 0, y: 0 }]);
});

test("squeeze-width opening is not passable with the normal footprint", () => {
  const walls = extractBlockingWalls(gapRoom(80));
  const normal = findPath({
    start: { x: -400, y: 0 },
    goal: { x: 0, y: 0 },
    radius: 50,
    walls
  });
  const squeezed = findPath({
    start: { x: -400, y: 0 },
    goal: { x: 0, y: 0 },
    radius: 25,
    walls
  });

  assert.equal(normal.complete, false);
  assert.equal(squeezed.complete, true);
  assert.ok(clearanceOfPath(squeezed.points, walls) >= 24.4);
});

test("too-narrow opening is impassable even while squeezing", () => {
  const walls = extractBlockingWalls(gapRoom(30));
  const result = findPath({
    start: { x: -400, y: 0 },
    goal: { x: 0, y: 0 },
    radius: 25,
    walls
  });
  assert.equal(result.complete, false);
});

test("routes around the far end of a long wall", () => {
  const walls = extractBlockingWalls([wall(0, -800, 0, 800)]);
  const result = findPath({
    start: { x: -200, y: 0 },
    goal: { x: 300, y: 0 },
    radius: 40,
    walls
  });
  assert.equal(result.complete, true);
  assert.ok(clearanceOfPath(result.points, walls) >= 39.4);
});

test("closed room destination is unreachable but returns a partial route", () => {
  const walls = extractBlockingWalls(closedRoom(100, -100, 300, 200));
  const result = findPath({
    start: { x: -200, y: 0 },
    goal: { x: 200, y: 50 },
    radius: 40,
    walls
  });

  assert.equal(result.complete, false);
  assert.ok(result.points.length >= 1);
  assert.ok(clearanceOfPath(result.points, walls) >= 39.4);
});

test("multiple obstacles are routed without cuts", () => {
  const walls = extractBlockingWalls([
    wall(-100, -150, -100, 150, { id: "first" }),
    wall(100, -150, 100, 150, { id: "second" }),
    wall(200, -300, 400, -300, { id: "third" })
  ]);
  const result = findPath({
    start: { x: -300, y: 0 },
    goal: { x: 350, y: 100 },
    radius: 35,
    walls
  });
  assert.equal(result.complete, true);
  assert.ok(clearanceOfPath(result.points, walls) >= 34.4);
});

test("walls pruned from waypoint generation are still collision-tested", () => {
  const walls = extractBlockingWalls([
    wall(-100, -100, -100, 100, { id: "first" }),
    wall(100, -100, 100, 100, { id: "second" })
  ]);
  const result = findPath({
    start: { x: -300, y: 0 },
    goal: { x: 300, y: 0 },
    radius: 30,
    walls,
    maxWalls: 1
  });
  assert.ok(clearanceOfPath(result.points, walls) >= 29.4, "a pruned wall must never be crossed");
});

test("waypoint cap is respected and does not corrupt the result", () => {
  const walls = extractBlockingWalls(
    Array.from({ length: 20 }, (_, index) =>
      wall(index * 40 - 400, -150 + (index % 2) * 300, index * 40 - 400, 150 + (index % 2) * 300, { id: `w${index}` })
    )
  );
  const result = findPath({
    start: { x: -450, y: 0 },
    goal: { x: 450, y: 0 },
    radius: 30,
    walls,
    maxWaypoints: 20
  });
  assert.ok(result.points.length >= 1);
  if (result.complete) {
    assert.ok(clearanceOfPath(result.points, walls) >= 29.4);
  }
});
