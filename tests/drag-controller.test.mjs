// AI notice: created with AI assistance (Freebuff / Codebuff). See NOTICE.md.
import assert from "node:assert/strict";
import test from "node:test";
import { DragController } from "../src/foundry/drag-controller.mjs";
import { MovementLedger, WallCache } from "../src/foundry/adapters.mjs";
import { FakeToken, installFoundryMock } from "./helpers/foundry-mock.mjs";
import { distance } from "../src/core/vec.mjs";

function createPreview() {
  return {
    last: null,
    attach() {
      return true;
    },
    clear() {
      this.last = null;
    },
    draw(plan, context) {
      this.last = { plan, context };
    }
  };
}

function createController(testContext) {
  const preview = createPreview();
  const ledger = new MovementLedger();
  const controller = new DragController({
    preview,
    wallCache: new WallCache(),
    ledger
  });
  testContext.after(() => controller.uninstall());
  return { controller, preview, ledger };
}

function tokenAt(id, centerX, centerY, options = {}) {
  return new FakeToken({
    id,
    x: centerX - (options.widthPx ?? 100) / 2,
    y: centerY - (options.heightPx ?? 100) / 2,
    ...options
  });
}

function dragTo(token, controller, point) {
  globalThis.canvas.mousePosition = { ...point };
  token._onDragLeftMove({});
  return controller.session;
}

test("drag is constrained before a squeeze gap and activates on the marker", (t) => {
  // 60 ft of movement: the 20 ft route costs 23 ft because of the squeeze section.
  const moving = tokenAt("hero", -400, 0, { movementSpeed: 60 });
  installFoundryMock({
    walls: [
      { id: "room-top", c: [-200, -200, 200, -200], move: 1, door: 0, ds: 0 },
      { id: "room-right", c: [200, -200, 200, 200], move: 1, door: 0, ds: 0 },
      { id: "room-bottom", c: [200, 200, -200, 200], move: 1, door: 0, ds: 0 },
      { id: "room-left-lower", c: [-200, 200, -200, 40], move: 1, door: 0, ds: 0 },
      { id: "room-left-upper", c: [-200, -40, -200, -200], move: 1, door: 0, ds: 0 }
    ],
    tokens: [moving]
  });
  const { controller, preview } = createController(t);
  assert.equal(controller.install(), true);

  moving._onDragLeftStart({});
  assert.ok(controller.session, "drag session should exist");
  assert.equal(controller.session.origin.x, -400);

  dragTo(moving, controller, { x: 0, y: 0 });
  assert.equal(controller.session.squeezeActive, false);
  assert.ok(moving.center.x < -225, `token should stop before the gap, got ${moving.center.x}`);
  assert.equal(preview.last.plan.markers.length, 1);
  assert.equal(preview.last.context.squeezeActive, false);

  const marker = preview.last.plan.markers[0];
  dragTo(moving, controller, { x: marker.x, y: marker.y });
  assert.equal(controller.session.squeezeActive, true);
  assert.equal(preview.last.context.squeezeActive, true);

  dragTo(moving, controller, { x: 0, y: 0 });
  assert.ok(Math.abs(moving.center.x) < 0.001, "committed squeeze should reach the cursor");
  assert.ok(Math.abs(moving.center.y) < 0.001);

  moving._onDragLeftDrop({});
  assert.equal(controller.session, null);
  assert.ok(moving.droppedCenter);
  assert.ok(Math.abs(moving.droppedCenter.x) < 0.001);
});

test("a token dropped inside a squeeze gap resumes squeezing on the next drag", (t) => {
  const moving = tokenAt("hero", -200, 0, { movementSpeed: 60 });
  installFoundryMock({
    walls: [
      { id: "room-top", c: [-200, -200, 200, -200], move: 1, door: 0, ds: 0 },
      { id: "room-right", c: [200, -200, 200, 200], move: 1, door: 0, ds: 0 },
      { id: "room-bottom", c: [200, 200, -200, 200], move: 1, door: 0, ds: 0 },
      { id: "room-left-lower", c: [-200, 200, -200, 40], move: 1, door: 0, ds: 0 },
      { id: "room-left-upper", c: [-200, -40, -200, -200], move: 1, door: 0, ds: 0 }
    ],
    tokens: [moving]
  });
  const { controller } = createController(t);
  controller.install();

  moving._onDragLeftStart({});
  assert.equal(controller.session.squeezeActive, true);
  dragTo(moving, controller, { x: 0, y: 0 });
  assert.ok(Math.abs(moving.center.x) < 0.001, "continues through the passage while squeezing");
});

test("token stops at hostile contact and never overlaps", (t) => {
  const moving = tokenAt("hero", 0, 0);
  const goblin = tokenAt("goblin", 250, 0, { disposition: -1 });
  installFoundryMock({ tokens: [moving, goblin] });
  const { controller, preview } = createController(t);
  controller.install();

  moving._onDragLeftStart({});
  dragTo(moving, controller, { x: 400, y: 0 });

  assert.equal(preview.last.plan.status, "contact");
  assert.ok(Math.abs(moving.center.x - 150) < 0.5, `expected contact at 150, got ${moving.center.x}`);
  assert.ok(distance(moving.center, goblin.center) >= 99.5);
});

test("friendly tokens do not block", (t) => {
  const moving = tokenAt("hero", 0, 0);
  const friend = tokenAt("friend", 250, 0, { disposition: 1 });
  installFoundryMock({ tokens: [moving, friend] });
  const { controller } = createController(t);
  controller.install();

  moving._onDragLeftStart({});
  dragTo(moving, controller, { x: 400, y: 0 });
  assert.ok(Math.abs(moving.center.x - 400) < 0.001);
});

test("cursor over a touched enemy rotates the token around its perimeter", (t) => {
  const moving = tokenAt("hero", 150, 0);
  const goblin = tokenAt("goblin", 250, 0, { disposition: -1 });
  installFoundryMock({ tokens: [moving, goblin] });
  const { controller, preview } = createController(t);
  controller.install();

  moving._onDragLeftStart({});
  dragTo(moving, controller, { x: 250, y: -50 });

  assert.ok(controller.session.rotationEnemyId === "goblin");
  assert.ok(preview.last.plan.rotation, "preview should show rotation state");
  assert.ok(Math.abs(moving.center.x - 250) < 0.5, `rotation x, got ${moving.center.x}`);
  assert.ok(Math.abs(moving.center.y + 100) < 0.5, `rotation y, got ${moving.center.y}`);
  assert.ok(distance(moving.center, goblin.center) >= 99.5, "must stay on the perimeter");

  dragTo(moving, controller, { x: 150, y: -200 });
  assert.equal(controller.session.rotationEnemyId, null);
  assert.ok(moving.center.y < -100, "ordinary pathfinding resumes after leaving the enemy");
});

test("multi-token drags are left entirely to Foundry", (t) => {
  const first = tokenAt("a", 0, 0);
  const second = tokenAt("b", 100, 0);
  installFoundryMock({ tokens: [first, second], controlled: [first, second] });
  const { controller } = createController(t);
  controller.install();

  first._onDragLeftStart({});
  assert.equal(controller.session, null);
  dragTo(first, controller, { x: 300, y: 200 });
  assert.ok(Math.abs(first.center.x - 300) < 0.001);
});

test("gridded scenes are not constrained", (t) => {
  const moving = tokenAt("hero", 0, 0);
  const mock = installFoundryMock({ tokens: [moving] });
  mock.scene.grid.isGridless = false;
  mock.scene.grid.type = 1;

  const { controller } = createController(t);
  controller.install();
  moving._onDragLeftStart({});
  assert.equal(controller.session, null);
  dragTo(moving, controller, { x: 300, y: 200 });
  assert.ok(Math.abs(moving.center.x - 300) < 0.001);
});

test("movement budget clamps the dragged position", (t) => {
  const moving = tokenAt("hero", 0, 0, { movementSpeed: 10 });
  installFoundryMock({ tokens: [moving], settings: { enforceMovementBudget: true } });
  const { controller, preview } = createController(t);
  controller.install();

  moving._onDragLeftStart({});
  dragTo(moving, controller, { x: 400, y: 0 });

  assert.equal(controller.session.budget, 10);
  assert.equal(preview.last.plan.status, "budget");
  assert.ok(moving.center.x < 400);
  assert.ok(distance({ x: 0, y: 0 }, moving.center) <= 200.5, "10 ft is 200 px at 5 ft / 100 px");
});

test("uninstall restores the original token drag handlers", (t) => {
  const moving = tokenAt("hero", 0, 0);
  installFoundryMock({ tokens: [moving] });
  const { controller } = createController(t);
  const original = FakeToken.prototype._onDragLeftMove;
  controller.install();
  assert.notEqual(FakeToken.prototype._onDragLeftMove, original);
  controller.uninstall();
  assert.equal(FakeToken.prototype._onDragLeftMove, original);
});
