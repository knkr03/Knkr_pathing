// AI notice: created with AI assistance (Freebuff / Codebuff). See NOTICE.md.
import assert from "node:assert/strict";
import test from "node:test";
import {
  clampPolylineAtEnemies,
  filterEnemies,
  findEnemyUnderCursor,
  isTouchingEnemy,
  resolveRotation
} from "../src/core/enemies.mjs";
import { enemy } from "./helpers/scene.mjs";

test("enemy filtering follows disposition policy and hidden rules", () => {
  const candidates = [
    { id: "hostile", disposition: -1 },
    { id: "neutral", disposition: 0 },
    { id: "friendly", disposition: 1 },
    { id: "hidden-hostile", disposition: -1, hidden: true },
    { id: "secret", disposition: -2 }
  ];

  assert.deepEqual(filterEnemies(candidates).map((entry) => entry.id), ["hostile"]);
  assert.deepEqual(
    filterEnemies(candidates, { policy: "hostile-neutral" }).map((entry) => entry.id),
    ["hostile", "neutral"]
  );
  assert.deepEqual(
    filterEnemies(candidates, { policy: "non-friendly" }).map((entry) => entry.id),
    ["hostile", "neutral"]
  );
  assert.deepEqual(
    filterEnemies(candidates, { includeHidden: true }).map((entry) => entry.id),
    ["hostile", "hidden-hostile"]
  );
});

test("route stops at the first enemy contact, not at the destination overlay", () => {
  const result = clampPolylineAtEnemies([{ x: 0, y: 0 }, { x: 400, y: 0 }], {
    movingRadius: 50,
    enemies: [enemy("goblin", 250, 0, 50)]
  });

  assert.equal(result.contact.enemyId, "goblin");
  assert.ok(Math.abs(result.contact.point.x - 150) < 1e-6);
  assert.ok(Math.abs(result.contact.point.y) < 1e-6);
  assert.equal(result.points.length, 2);
  assert.ok(Math.abs(result.points[1].x - 150) < 1e-6);
});

test("nearest of several contacts wins", () => {
  const result = clampPolylineAtEnemies([{ x: 0, y: 0 }, { x: 600, y: 0 }], {
    movingRadius: 50,
    enemies: [enemy("far", 500, 0, 50), enemy("near", 300, 0, 50)]
  });
  assert.equal(result.contact.enemyId, "near");
  assert.ok(Math.abs(result.contact.point.x - 200) < 1e-6);
});

test("a token already touching an enemy may move away", () => {
  const result = clampPolylineAtEnemies([{ x: 150, y: 0 }, { x: 0, y: 0 }], {
    movingRadius: 50,
    enemies: [enemy("goblin", 250, 0, 50)]
  });
  assert.equal(result.contact, null);
  assert.deepEqual(result.points, [{ x: 150, y: 0 }, { x: 0, y: 0 }]);
});

test("a token already touching an enemy is stopped when pushing deeper", () => {
  const result = clampPolylineAtEnemies([{ x: 150, y: 0 }, { x: 250, y: 0 }], {
    movingRadius: 50,
    enemies: [enemy("goblin", 250, 0, 50)]
  });
  assert.equal(result.contact.enemyId, "goblin");
  assert.ok(Math.abs(result.contact.point.x - 150) < 1e-6);
});

test("a token already touching an enemy cannot be dragged through it", () => {
  const result = clampPolylineAtEnemies([{ x: 150, y: 0 }, { x: 350, y: 0 }], {
    movingRadius: 50,
    enemies: [enemy("goblin", 250, 0, 50)]
  });
  assert.equal(result.contact.enemyId, "goblin");
  assert.ok(Math.abs(result.contact.point.x - 150) < 1e-6);
  assert.equal(result.points.length, 1);
});

test("isTouchingEnemy and findEnemyUnderCursor", () => {
  const goblin = enemy("goblin", 0, 0, 50);
  assert.equal(isTouchingEnemy({ x: 100, y: 0 }, goblin, 50, 1), true);
  assert.equal(isTouchingEnemy({ x: 400, y: 0 }, goblin, 50, 1), false);
  assert.equal(findEnemyUnderCursor([goblin, enemy("orc", 200, 0, 80)], { x: 190, y: 0 })?.id, "orc");
  assert.equal(findEnemyUnderCursor([goblin], { x: 100, y: 0 }), null);
});

test("rotation follows the cursor angle around the enemy", () => {
  const goblin = enemy("goblin", 0, 0, 50);
  const result = resolveRotation({
    enemy: goblin,
    cursor: { x: 0, y: -200 },
    movingRadius: 50,
    lastAngle: 0,
    isPositionValid: () => true
  });
  assert.ok(result);
  assert.ok(Math.abs(result.point.x) < 1e-6);
  assert.ok(Math.abs(result.point.y + 100) < 1e-6);
  assert.equal(result.clamped, false);
});

test("rotation clamps at the last legal arc position", () => {
  const goblin = enemy("goblin", 0, 0, 50);
  const result = resolveRotation({
    enemy: goblin,
    cursor: { x: 0, y: -200 },
    movingRadius: 50,
    lastAngle: 0,
    isPositionValid: (point, angle) => angle > -Math.PI / 6,
    step: Math.PI / 180
  });
  assert.ok(result);
  assert.equal(result.clamped, true);
  assert.ok(result.angle > -Math.PI / 6 - 0.02);
  assert.ok(result.angle < -0.45);
});

test("rotation preserves the last angle when the cursor is at the center", () => {
  const goblin = enemy("goblin", 0, 0, 50);
  const result = resolveRotation({
    enemy: goblin,
    cursor: { x: 0, y: 0 },
    movingRadius: 50,
    lastAngle: Math.PI / 4,
    isPositionValid: () => true
  });
  assert.ok(result);
  assert.ok(Math.abs(result.angle - Math.PI / 4) < 1e-9);
  assert.equal(result.clamped, false);
});

test("rotation returns null when no perimeter position is legal", () => {
  const result = resolveRotation({
    enemy: enemy("goblin", 0, 0, 50),
    cursor: { x: 0, y: -200 },
    movingRadius: 50,
    lastAngle: 0,
    isPositionValid: () => false
  });
  assert.equal(result, null);
});
