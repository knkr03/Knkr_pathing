// AI notice: created with AI assistance (Freebuff / Codebuff). See NOTICE.md.
import assert from "node:assert/strict";
import test from "node:test";
import {
  boundsOfPoints,
  expandBounds,
  firstCircleContactOnSegment,
  pointAtDistance,
  pointSegmentDistance,
  polylineLength,
  samplePolyline,
  segmentSegmentDistance,
  segmentsIntersect,
  truncatePolyline
} from "../src/core/geometry.mjs";
import { distance, normalize, rotate } from "../src/core/vec.mjs";

test("pointSegmentDistance handles projection and endpoints", () => {
  assert.equal(pointSegmentDistance({ x: 50, y: 40 }, { x: 0, y: 0 }, { x: 100, y: 0 }), 40);
  assert.equal(pointSegmentDistance({ x: -30, y: 0 }, { x: 0, y: 0 }, { x: 100, y: 0 }), 30);
  assert.equal(pointSegmentDistance({ x: 100, y: 0 }, { x: 0, y: 0 }, { x: 100, y: 0 }), 0);
});

test("segmentSegmentDistance detects crossings and near misses", () => {
  assert.equal(segmentSegmentDistance({ x: -1, y: 0 }, { x: 1, y: 0 }, { x: 0, y: -1 }, { x: 0, y: 1 }), 0);
  assert.equal(
    segmentSegmentDistance({ x: -50, y: 0 }, { x: 50, y: 0 }, { x: -50, y: 30 }, { x: 50, y: 30 }),
    30
  );
  assert.equal(
    segmentSegmentDistance({ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 0, y: 10 }, { x: 0, y: 100 }),
    10
  );
});

test("collinear overlapping segments count as intersecting", () => {
  assert.equal(segmentsIntersect({ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 50, y: 0 }, { x: 150, y: 0 }), true);
  assert.equal(segmentsIntersect({ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 200, y: 0 }, { x: 300, y: 0 }), false);
});

test("polyline length, sampling, and point-at-distance", () => {
  const points = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }];
  assert.equal(polylineLength(points), 200);
  assert.deepEqual(pointAtDistance(points, 150).point, { x: 100, y: 50 });
  const samples = samplePolyline(points, 25);
  assert.equal(samples[0].distance, 0);
  assert.equal(samples[samples.length - 1].distance, 200);
  assert.ok(samples.length >= 9);
});

test("truncatePolyline interpolates and clamps", () => {
  const points = [{ x: 0, y: 0 }, { x: 100, y: 0 }];
  assert.deepEqual(truncatePolyline(points, 25), [{ x: 0, y: 0 }, { x: 25, y: 0 }]);
  assert.deepEqual(truncatePolyline(points, 0), [{ x: 0, y: 0 }]);
  assert.deepEqual(truncatePolyline(points, 500), points);
});

test("firstCircleContactOnSegment finds the entry point", () => {
  assert.equal(
    firstCircleContactOnSegment({ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 0 }, 50),
    0.75
  );
  assert.equal(
    firstCircleContactOnSegment({ x: 200, y: 0 }, { x: 300, y: 0 }, { x: 200, y: 0 }, 50),
    0
  );
  assert.equal(
    firstCircleContactOnSegment({ x: 200, y: 100 }, { x: 300, y: 100 }, { x: 200, y: 0 }, 50),
    null
  );
});

test("bounds and vector helpers", () => {
  const bounds = expandBounds(boundsOfPoints([{ x: 0, y: 0 }, { x: 10, y: 20 }]), 5);
  assert.deepEqual(bounds, { minX: -5, minY: -5, maxX: 15, maxY: 25 });
  assert.deepEqual(normalize({ x: 0, y: 0 }), { x: 0, y: 0 });
  const rotated = rotate({ x: 10, y: 0 }, Math.PI / 2);
  assert.ok(Math.abs(rotated.x) < 1e-9);
  assert.ok(Math.abs(rotated.y - 10) < 1e-9);
  assert.equal(distance({ x: 0, y: 0 }, { x: 3, y: 4 }), 5);
});
