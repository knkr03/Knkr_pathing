// AI notice: created with AI assistance (Freebuff / Codebuff). See NOTICE.md.
import assert from "node:assert/strict";
import test from "node:test";
import { findPath } from "../src/core/pathfinder.mjs";
import { segmentMinClearance } from "../src/core/walls.mjs";
import { polylineLength } from "../src/core/geometry.mjs";
import { extractBlockingWalls } from "../src/core/walls.mjs";
import { closedRoom, gapRoom, gapWalls, wall } from "./helpers/scene.mjs";

/** Closed room whose doorway has short perpendicular jamb returns. */
function jambedGapRoom(gap, depth = 60) {
  const half = gap / 2;
  return [
    ...gapRoom(gap),
    wall(-200, -half, -200 + depth, -half, { id: "jamb-top" }),
    wall(-200, half, -200 + depth, half, { id: "jamb-bottom" })
  ];
}

/** Corridor split by a baffle, leaving a node-to-face gap at the bottom. */
function baffleCorridor(gap = 60) {
  return [
    wall(-300, 0, 300, 0, { id: "top" }),
    wall(-300, 120, 300, 120, { id: "bottom" }),
    wall(-300, 0, -300, 120, { id: "left" }),
    wall(300, 0, 300, 120, { id: "right" }),
    wall(0, 0, 0, 120 - gap, { id: "baffle" })
  ];
}

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

test("a gap exactly the token diameter passes at every approach angle", () => {
  const walls = extractBlockingWalls(gapRoom(100));
  const cases = [
    { start: { x: -400, y: 0 }, goal: { x: 100, y: 50 } },
    { start: { x: -400, y: 150 }, goal: { x: 100, y: 0 } },
    { start: { x: -400, y: -150 }, goal: { x: 100, y: -100 } },
    { start: { x: 100, y: 100 }, goal: { x: -400, y: 0 } },
    { start: { x: -400, y: 100 }, goal: { x: 0, y: -150 } },
    { start: { x: -400, y: -80 }, goal: { x: 150, y: 150 } }
  ];

  for (const entry of cases) {
    const result = findPath({ ...entry, radius: 50, walls });
    assert.equal(
      result.complete,
      true,
      `gap should be passable from ${JSON.stringify(entry.start)} to ${JSON.stringify(entry.goal)}`
    );
    assert.ok(
      clearanceOfPath(result.points, walls) >= 49.99,
      "the token's actual diameter must clear the wall endpoints"
    );
  }
});

test("a gap just under the token diameter is not passable", () => {
  const walls = extractBlockingWalls(gapRoom(99));
  for (const goal of [{ x: 0, y: 0 }, { x: 100, y: 50 }, { x: -100, y: 80 }]) {
    const result = findPath({
      start: { x: -400, y: 0 },
      goal,
      radius: 50,
      walls
    });
    assert.equal(result.complete, false, `99 px gap must reject a 100 px token at ${goal.x},${goal.y}`);
  }
});

test("a reduced passage radius makes a 75% gap passable at every approach angle", () => {
  const walls = extractBlockingWalls(gapRoom(75));
  const cases = [
    { start: { x: -400, y: 0 }, goal: { x: 100, y: 50 } },
    { start: { x: -400, y: 150 }, goal: { x: 100, y: 0 } },
    { start: { x: -400, y: -150 }, goal: { x: 100, y: -100 } },
    { start: { x: 100, y: 100 }, goal: { x: -400, y: 0 } },
    { start: { x: -400, y: 100 }, goal: { x: 0, y: -150 } },
    { start: { x: -400, y: -80 }, goal: { x: 150, y: 150 } }
  ];

  for (const entry of cases) {
    const result = findPath({ ...entry, radius: 50, passageRadius: 37.5, walls });
    assert.equal(
      result.complete,
      true,
      `75 px gap should be passable from ${JSON.stringify(entry.start)} to ${JSON.stringify(entry.goal)}`
    );
    assert.ok(
      clearanceOfPath(result.points, walls) >= 37.49,
      "the crossing uses the reduced gap radius"
    );
  }
});

test("a gap just under 75% is not passable", () => {
  const walls = extractBlockingWalls(gapRoom(74));
  for (const goal of [{ x: 0, y: 0 }, { x: 100, y: 50 }, { x: -100, y: 80 }]) {
    const result = findPath({
      start: { x: -400, y: 0 },
      goal,
      radius: 50,
      passageRadius: 37.5,
      walls
    });
    assert.equal(result.complete, false, `74 px gap must reject a 100 px token at ${goal.x},${goal.y}`);
  }
});

test("a 4 ft doorway with jamb walls passes at 75% and 25%", () => {
  const walls = extractBlockingWalls(jambedGapRoom(80));
  for (const passageRadius of [37.5, 12.5]) {
    const result = findPath({
      start: { x: -400, y: 0 },
      goal: { x: 0, y: 0 },
      radius: 50,
      passageRadius,
      walls
    });
    assert.equal(result.complete, true, `80 px jambed doorway should pass at ${passageRadius * 2} px`);
  }
});

test("a wall attached at a doorway corner does not close the opening", () => {
  const walls = extractBlockingWalls(jambedGapRoom(80));
  const result = findPath({
    start: { x: -400, y: 0 },
    goal: { x: 0, y: 0 },
    radius: 50,
    passageRadius: 12.5,
    walls
  });
  assert.equal(result.complete, true);
  assert.ok(result.points.length >= 3, "the route must include explicit doorway guidance");
});

test("a 3 ft node-to-wall gap passes at a 0.5 modifier", () => {
  const walls = extractBlockingWalls(baffleCorridor(60));
  const result = findPath({
    start: { x: -150, y: 60 },
    goal: { x: 150, y: 60 },
    radius: 50,
    passageRadius: 25,
    walls
  });

  assert.equal(result.complete, true);
  assert.ok(result.points.length >= 3, "the route must dip through the baffle gap");
  assert.ok(Math.max(...result.points.map((point) => point.y)) > 70, "the route must enter the gap");
});

test("an unusable far lead does not discard a passable gap", () => {
  // The second (longer) lead on the far side falls outside a tight search
  // bound. The near lead is still valid, so the opening remains usable.
  const walls = extractBlockingWalls([
    wall(0, -300, 0, -30, { id: "upper" }),
    wall(0, 30, 0, 300, { id: "lower" })
  ]);
  const result = findPath({
    start: { x: -150, y: 0 },
    goal: { x: 70, y: 0 },
    radius: 50,
    passageRadius: 25,
    walls,
    bounds: { minX: -200, minY: -200, maxX: 80, maxY: 200 }
  });

  assert.equal(result.complete, true);
  assert.ok(Math.abs(result.points.at(-1).x - 70) < 0.001);
});

test("the same 3 ft node-to-wall gap is rejected at a 0.75 modifier", () => {
  const walls = extractBlockingWalls(baffleCorridor(60));
  const result = findPath({
    start: { x: -150, y: 60 },
    goal: { x: 150, y: 60 },
    radius: 50,
    passageRadius: 37.5,
    walls
  });
  assert.equal(result.complete, false);
});

test("a narrow corridor bounded by a third wall uses reduced clearance on exit", () => {
  // This is the wall layout from the live test scene: a 77.5 px gap between
  // two vertical wall ends, with a third wall just beyond the far lead.
  const walls = extractBlockingWalls([
    wall(3900, 1970, 3900, 2400, { id: "lower" }),
    wall(3891, 1893, 3900, 1171, { id: "upper" }),
    wall(4019, 1904, 4300, 1900, { id: "return" })
  ]);
  const result = findPath({
    start: { x: 3728, y: 1933 },
    goal: { x: 3990, y: 1930 },
    radius: 50,
    passageRadius: 25,
    walls
  });

  assert.equal(result.complete, true);
  assert.ok(result.points.length >= 3);
  assert.ok(Math.abs(result.points.at(-1).x - 3990) < 0.001);
});

test("reducing the passage radius does not shrink ordinary wall clearance", () => {
  const walls = extractBlockingWalls([wall(0, -200, 0, 200)]);
  const result = findPath({
    start: { x: -200, y: 0 },
    goal: { x: 300, y: 0 },
    radius: 50,
    passageRadius: 37.5,
    walls
  });

  assert.equal(result.complete, true);
  assert.ok(clearanceOfPath(result.points, walls) >= 49.4, "walls still use the full body radius");
});

test("an opening narrower than the footprint is not passable", () => {
  const walls = extractBlockingWalls(gapRoom(80));
  const normal = findPath({
    start: { x: -400, y: 0 },
    goal: { x: 0, y: 0 },
    radius: 50,
    walls
  });
  const smaller = findPath({
    start: { x: -400, y: 0 },
    goal: { x: 0, y: 0 },
    radius: 25,
    walls
  });

  assert.equal(normal.complete, false);
  assert.equal(smaller.complete, true);
  assert.ok(clearanceOfPath(smaller.points, walls) >= 24.4);
});

test("too-narrow opening is impassable", () => {
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
