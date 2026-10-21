// AI notice: created with AI assistance (Freebuff / Codebuff). See NOTICE.md.
import assert from "node:assert/strict";
import test from "node:test";
import { DragController } from "../src/foundry/drag-controller.mjs";
import { MovementLedger, WallCache } from "../src/foundry/adapters.mjs";
import { getNativeMovement } from "../src/foundry/adapters.mjs";
import { FakeToken, installFoundryMock } from "./helpers/foundry-mock.mjs";

function controllerFor(testContext) {
  const preview = { attach: () => true, clear: () => {}, draw: () => {} };
  const controller = new DragController({
    preview,
    wallCache: new WallCache(),
    ledger: new MovementLedger()
  });
  testContext.after(() => controller.uninstall());
  return controller;
}

function hero(options = {}) {
  return new FakeToken({
    id: "hero",
    x: -50,
    y: -50,
    ...options
  });
}

test("budget is not enforced outside combat", (t) => {
  const token = hero({ movementSpeed: 10 });
  installFoundryMock({ tokens: [token] });
  globalThis.game.combat = null;
  const controller = controllerFor(t);
  controller.install();

  token._onDragLeftStart({});
  globalThis.canvas.mousePosition = { x: 400, y: 0 };
  token._onDragLeftMove({});

  assert.equal(controller.session.budget, null);
  assert.ok(Math.abs(token.center.x - 400) < 0.001);
});

test("budget uses the active movement action and native movement history", (t) => {
  const token = hero({ movementSpeed: 30 });
  token.document.movementAction = "fly";
  token.actor.system.attributes.movement = { walk: 30, fly: 60, units: "ft" };
  token.document.movementHistory = [{ cost: 10, action: "fly" }];

  installFoundryMock({ tokens: [token] });
  const movement = getNativeMovement(token);
  assert.equal(movement.action, "fly");
  assert.equal(movement.speed, 60);
  assert.equal(movement.spent, 10);
  assert.equal(movement.available, true);

  const controller = controllerFor(t);
  controller.install();
  token._onDragLeftStart({});
  assert.equal(controller.session.budget, 50);
});

test("low remaining movement clamps a long drag", (t) => {
  const token = hero({ movementSpeed: 5 });
  installFoundryMock({ tokens: [token] });
  const controller = controllerFor(t);
  controller.install();

  token._onDragLeftStart({});
  globalThis.canvas.mousePosition = { x: 400, y: 0 };
  token._onDragLeftMove({});

  assert.equal(controller.session.budget, 5);
  assert.ok(token.center.x < 400);
  assert.ok(token.center.x <= 100.5);
});
