// AI notice: created with AI assistance (Freebuff / Codebuff). See NOTICE.md.
import assert from "node:assert/strict";
import test from "node:test";
import { planMovement } from "../src/core/planner.mjs";
import { extractBlockingWalls } from "../src/core/walls.mjs";
import { gapRoom, mediumPlanOptions, enemy, closedRoom } from "./helpers/scene.mjs";

const base = {
  start: { x: -400, y: 0 },
  goal: { x: 0, y: 0 },
  walls: extractBlockingWalls(gapRoom(140)),
  ...mediumPlanOptions()
};

test("normal movement in open space", () => {
  const plan = planMovement({ ...base, walls: [] });
  assert.equal(plan.status, "normal");
  assert.equal(plan.complete, true);
  assert.ok(Math.abs(plan.totalDistance - 20) < 1e-6);
});

test("a gap at least the token diameter passes when no passage radius is supplied", () => {
  const plan = planMovement(base);
  assert.equal(plan.status, "normal");
  assert.equal(plan.routeMode, "normal");
  assert.equal(plan.complete, true);
  assert.equal(plan.radius, 50);
});

test("a gap narrower than the token is impassable with a partial route", () => {
  const plan = planMovement({
    ...base,
    walls: extractBlockingWalls(gapRoom(80))
  });
  assert.equal(plan.status, "impassable");
  assert.equal(plan.complete, false);
  assert.ok(plan.points.length >= 1);
  assert.ok(plan.endpoint.x < -225, `preview should stop before the gap, got ${plan.endpoint.x}`);
});

test("a large token cannot use a gap a small token fits through", () => {
  const walls = extractBlockingWalls(gapRoom(140));
  const small = planMovement({ ...base, walls, radius: 50 });
  const large = planMovement({ ...base, walls, radius: 75 });
  assert.equal(small.complete, true);
  assert.equal(large.complete, false);
});

test("a passage radius allows a gap at 75% of the token width", () => {
  const plan = planMovement({
    ...base,
    walls: extractBlockingWalls(gapRoom(75)),
    radius: 50,
    passageRadius: 37.5
  });
  assert.equal(plan.status, "normal");
  assert.equal(plan.complete, true);
  assert.equal(plan.radius, 50);
  assert.equal(plan.passageRadius, 37.5);
});

test("a gap just under 75% remains impassable", () => {
  const plan = planMovement({
    ...base,
    walls: extractBlockingWalls(gapRoom(74)),
    radius: 50,
    passageRadius: 37.5
  });
  assert.equal(plan.status, "impassable");
  assert.equal(plan.complete, false);
  assert.ok(plan.points.length >= 1);
});

test("closed room is unreachable and still moves to the wall", () => {
  const plan = planMovement({
    ...base,
    walls: extractBlockingWalls(closedRoom(100, -100, 300, 200)),
    goal: { x: 200, y: 50 }
  });
  assert.equal(plan.status, "impassable");
  assert.equal(plan.complete, false);
  assert.ok(plan.points.length >= 2, "the potential partial move must be shown");
  assert.ok(plan.endpoint.x > -100, `expected the token to approach the room wall, got ${plan.endpoint.x}`);
  assert.ok(plan.totalDistance > 1);
});

test("a sealed room moves a token as far as body clearance allows", () => {
  const plan = planMovement({
    ...base,
    walls: extractBlockingWalls(closedRoom(-200, -200, 200, 200)),
    goal: { x: 0, y: 0 }
  });

  assert.equal(plan.status, "impassable");
  assert.equal(plan.complete, false);
  assert.ok(Math.abs(plan.endpoint.x + 250) < 1, `expected x=-250, got ${plan.endpoint.x}`);
  assert.ok(Math.abs(plan.endpoint.y) < 1);
  assert.ok(Math.abs(plan.totalDistance - 7.5) < 0.1);
});

test("a too-narrow gap is approached as closely as full body clearance allows", () => {
  const plan = planMovement({
    ...base,
    walls: extractBlockingWalls(gapRoom(80))
  });

  assert.equal(plan.status, "impassable");
  assert.equal(plan.complete, false);
  assert.ok(Math.abs(plan.endpoint.x + 230) < 1, `expected x≈-230, got ${plan.endpoint.x}`);
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

test("a plan reports distance without movement-limit truncation", () => {
  const plan = planMovement({ ...base, walls: [] });
  assert.equal(plan.status, "normal");
  assert.equal(plan.complete, true);
  assert.equal("budgetExhausted" in plan, false);
  assert.equal(plan.movementLimit, null);
});

test("an external movement budget truncates the route by scene distance", () => {
  const plan = planMovement({
    ...base,
    walls: [],
    maxDistance: 10
  });

  assert.equal(plan.status, "limited");
  assert.equal(plan.routeMode, "limited");
  assert.equal(plan.complete, false);
  assert.ok(Math.abs(plan.endpoint.x - (-200)) < 0.001, `expected 10 ft, got ${plan.endpoint.x}`);
  assert.ok(Math.abs(plan.totalDistance - 10) < 1e-6);
  assert.equal(plan.movementLimit.remaining, 10);
  assert.equal(plan.movementLimit.exhausted, true);
});

test("a budget equal to the route leaves the destination reachable", () => {
  const plan = planMovement({
    ...base,
    walls: [],
    maxDistance: 20
  });

  assert.equal(plan.status, "normal");
  assert.equal(plan.complete, true);
  assert.equal(plan.movementLimit.exhausted, false);
});

test("contact beyond the movement budget is not reported as contact", () => {
  const plan = planMovement({
    ...base,
    walls: [],
    goal: { x: 400, y: 0 },
    enemies: [enemy("goblin", 250, 0, 50)],
    maxDistance: 10
  });

  assert.equal(plan.status, "limited");
  assert.equal(plan.contact, null);
  assert.ok(Math.abs(plan.endpoint.x - (-200)) < 0.001);
});

test("contact inside the movement budget still takes precedence", () => {
  const plan = planMovement({
    ...base,
    walls: [],
    goal: { x: 400, y: 0 },
    enemies: [enemy("goblin", 250, 0, 50)],
    maxDistance: 30
  });

  assert.equal(plan.status, "contact");
  assert.equal(plan.contact.enemyId, "goblin");
  assert.ok(Math.abs(plan.endpoint.x - 150) < 1e-6);
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
