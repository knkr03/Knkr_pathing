// AI notice: created with AI assistance (Freebuff / Codebuff). See NOTICE.md.
import assert from "node:assert/strict";
import test from "node:test";
import { buildSegments, summarizeSegments } from "../src/core/cost.mjs";

const points = [{ x: -400, y: 0 }, { x: 0, y: 0 }];

test("a straight route reports physical scene distance", () => {
  const segments = buildSegments(points, { unitsPerPixel: 0.05 });
  const summary = summarizeSegments(segments);

  assert.equal(segments.length, 1);
  assert.ok(Math.abs(summary.distance - 20) < 0.01, `physical distance should be 20 ft, got ${summary.distance}`);
  assert.equal(summary.cost, summary.distance);
});

test("repeated points do not create zero-length segments", () => {
  const segments = buildSegments(
    [{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 100, y: 0 }],
    { unitsPerPixel: 0.05 }
  );
  assert.equal(segments.length, 1);
});

test("an empty or single-point route has no distance", () => {
  assert.deepEqual(buildSegments([], { unitsPerPixel: 0.05 }), []);
  assert.deepEqual(buildSegments([{ x: 0, y: 0 }], { unitsPerPixel: 0.05 }), []);
  assert.deepEqual(summarizeSegments([]), { distance: 0, cost: 0 });
});
