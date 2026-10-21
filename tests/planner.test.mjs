// AI notice: created with AI assistance (Freebuff / Codebuff). See NOTICE.md.
import assert from "node:assert/strict";
import test from "node:test";
import { planMovement } from "../src/core/planner.mjs";
import { extractBlockingWalls } from "../src/core/walls.mjs";
import { gapRoom, mediumPlanOptions, enemy, closedRoom } from "./helpers/scene.mjs";

const base = {
  start: { x: -400, y: 0 },
  goal: { x: 0, y: 0 },
  walls: extractBlockingWalls(gapRoom(80)),
  markerDiameter: 30,
  markerBackoff: 30,
  ...mediumPlanOptions()
};

test("normal movement in open space", () => {
  const plan = planMovement({ ...base, walls: [] });
  assert.equal(plan.status, "normal");
  assert.equal(plan.complete, true);
  assert.equal(plan.markers.length, 0);
  assert.ok(Math.abs(plan.totalDistance - 20) < 1e-6);
});

test("squeeze-only gap produces a squeeze plan and one marker", () => {
  const plan = planMovement(base);
  assert.equal(plan.status, "squeeze");
  assert.equal(plan.routeMode, "squeeze");
  assert.equal(plan.normalReachable, false);
  assert.equal(plan.squeezeReachable, true);
  assert.equal(plan.markers.length, 1);
  assert.ok(plan.markers[0].x < -230);
  assert.ok(plan.squeezeRuns.length === 1);
  assert.ok(plan.squeezeDistance > 2 && plan.squeezeDistance < 4);
  assert.ok(Math.abs(plan.totalDistance - 20) < 0.1);
  assert.ok(Math.abs(plan.totalCost - (plan.totalDistance + plan.squeezeDistance)) < 1e-6);
});

test("too-narrow gap is impassable with no marker", () => {
  const plan = planMovement({
    ...base,
    walls: extractBlockingWalls(gapRoom(30))
  });
  assert.equal(plan.status, "impassable");
  assert.equal(plan.complete, false);
  assert.equal(plan.markers.length, 0);
});

test("closed room is unreachable and reports a partial route", () => {
  const plan = planMovement({
    ...base,
    walls: extractBlockingWalls(closedRoom(100, -100, 300, 200)),
    goal: { x: 200, y: 50 }
  });
  assert.equal(plan.status, "impassable");
  assert.equal(plan.complete, false);
  assert.ok(plan.points.length >= 1);
});

test("enemy contact truncates the plan before the goal", () => {
  const plan = planMovement({
    ...base,
    walls: [],
    goal: { x: 400, y: 0 },
    enemies: [enemy("goblin", 250, 0, 50)]
  });
  assert.equal(plan.status, "contact");
  assert.equal(plan.contact.enemyId, "goblin");
  assert.ok(Math.abs(plan.endpoint.x - 150) < 1e-6);
  assert.equal(plan.complete, false);
});

test("budget stops the plan at the last affordable point", () => {
  const plan = planMovement({ ...base, budget: 5 });
  assert.equal(plan.status, "budget");
  assert.equal(plan.budgetExhausted, true);
  assert.ok(plan.totalCost <= 5 + 1e-6);
  assert.ok(plan.endpoint.x < -260);
  assert.equal(plan.complete, false);
  assert.equal(plan.markers.length, 0, "marker should be beyond the budget cutoff");
});

test("budget above the total cost leaves the plan complete", () => {
  const plan = planMovement({ ...base, budget: 100 });
  assert.equal(plan.complete, true);
  assert.equal(plan.budgetExhausted, false);
});

test("enemy contact before a squeeze gap removes unreachable markers", () => {
  const plan = planMovement({
    ...base,
    enemies: [enemy("goblin", -300, 0, 50)]
  });
  assert.equal(plan.status, "contact");
  assert.equal(plan.markers.length, 0);
});

test("a token already touching an enemy can plan away from it", () => {
  const plan = planMovement({
    ...base,
    walls: [],
    start: { x: 150, y: 0 },
    goal: { x: 0, y: 0 },
    enemies: [enemy("goblin", 250, 0, 50)]
  });
  assert.equal(plan.status, "normal");
  assert.equal(plan.complete, true);
  assert.equal(plan.contact, null);
});

test("squeeze can be disabled explicitly", () => {
  const plan = planMovement({ ...base, allowSqueeze: false });
  assert.equal(plan.status, "impassable");
  assert.equal(plan.markers.length, 0);
});
