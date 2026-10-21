// AI notice: created with AI assistance (Freebuff / Codebuff). See NOTICE.md.
import assert from "node:assert/strict";
import test from "node:test";
import {
  clearanceAtPoint,
  extractBlockingWalls,
  filterWallsNear,
  nearestWalls,
  segmentClear,
  segmentMinClearance
} from "../src/core/walls.mjs";
import { gapWalls, wall } from "./helpers/scene.mjs";

test("movement restriction None does not block", () => {
  const walls = extractBlockingWalls([wall(0, 0, 100, 0, { move: 0 })]);
  assert.equal(walls.length, 0);
});

test("open doors do not block; closed and locked doors do", () => {
  assert.equal(extractBlockingWalls([wall(0, 0, 100, 0, { door: 1, ds: 1 })]).length, 0);
  assert.equal(extractBlockingWalls([wall(0, 0, 100, 0, { door: 1, ds: 0 })]).length, 1);
  assert.equal(extractBlockingWalls([wall(0, 0, 100, 0, { door: 1, ds: 2 })]).length, 1);
});

test("one-way walls are treated as blocking walls", () => {
  const walls = extractBlockingWalls([wall(0, 0, 100, 0, { dir: 1 })]);
  assert.equal(walls.length, 1);
  assert.equal(walls[0].blocks, true);
});

test("normalized walls carry endpoints, bounds, and stable ids", () => {
  const [normalized] = extractBlockingWalls([
    { _id: "abc", c: [10, 20, 110, 20], move: 1, door: 0, ds: 0 }
  ]);
  assert.deepEqual(normalized.a, { x: 10, y: 20 });
  assert.deepEqual(normalized.b, { x: 110, y: 20 });
  assert.deepEqual(normalized.bbox, { minX: 10, minY: 20, maxX: 110, maxY: 20 });
  assert.equal(normalized.id, "abc");
});

test("clearance and segment tests", () => {
  const walls = extractBlockingWalls(gapWalls(80));
  assert.equal(clearanceAtPoint({ x: 0, y: 0 }, walls), 40);
  assert.equal(segmentMinClearance({ x: -100, y: 0 }, { x: 100, y: 0 }, walls), 40);
  assert.equal(segmentClear({ x: -100, y: 0 }, { x: 100, y: 0 }, 39, walls), true);
  assert.equal(segmentClear({ x: -100, y: 0 }, { x: 100, y: 0 }, 41, walls), false);
});

test("wall filtering and nearest pruning", () => {
  const walls = extractBlockingWalls([
    ...gapWalls(80),
    wall(1000, 1000, 1100, 1000, { id: "far" })
  ]);
  const near = filterWallsNear(walls, { minX: -100, minY: -100, maxX: 100, maxY: 100 });
  assert.deepEqual(near.map((entry) => entry.id).sort(), ["gap-bottom", "gap-top"]);
  const nearest = nearestWalls(walls, { x: -100, y: 0 }, { x: 100, y: 0 }, 2);
  assert.equal(nearest.length, 2);
  assert.ok(nearest.every((entry) => entry.id !== "far"));
});
