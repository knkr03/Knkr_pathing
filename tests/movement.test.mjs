// AI notice: created with AI assistance (Freebuff / Codebuff). See NOTICE.md.
import assert from "node:assert/strict";
import test from "node:test";
import { DragController } from "../src/foundry/drag-controller.mjs";
import { WallCache, getMovementAction } from "../src/foundry/adapters.mjs";
import { FakeToken, installFoundryMock } from "./helpers/foundry-mock.mjs";

function controllerFor(testContext) {
  const preview = {
    attach: () => true,
    clear: () => {},
    draw: (plan) => { preview.last = plan; },
    last: null
  };
  const controller = new DragController({ preview, wallCache: new WallCache() });
  testContext.after(() => controller.uninstall());
  return { controller, preview };
}

function hero(options = {}) {
  return new FakeToken({
    id: "hero",
    x: -50,
    y: -50,
    ...options
  });
}

function installMovementLimiter(status, { active = true } = {}) {
  globalThis.game.modules.set("dnd5e-movement-limiter", {
    id: "dnd5e-movement-limiter",
    active,
    api: { status: () => status }
  });
}

function pathLength(points) {
  let total = 0;
  for (let index = 1; index < points.length; index += 1) {
    total += Math.hypot(points[index].x - points[index - 1].x, points[index].y - points[index - 1].y);
  }
  return total;
}

function gapRoom(gap) {
  const half = gap / 2;
  return [
    { id: "room-top", c: [-200, -200, 200, -200], move: 1, door: 0, ds: 0 },
    { id: "room-right", c: [200, -200, 200, 200], move: 1, door: 0, ds: 0 },
    { id: "room-bottom", c: [200, 200, -200, 200], move: 1, door: 0, ds: 0 },
    { id: "room-left-lower", c: [-200, 200, -200, half], move: 1, door: 0, ds: 0 },
    { id: "room-left-upper", c: [-200, -half, -200, -200], move: 1, door: 0, ds: 0 }
  ];
}

test("without an external budget, remaining movement never clamps a drag", (t) => {
  const token = hero({ movementSpeed: 5 });
  installFoundryMock({ tokens: [token] });
  const { controller } = controllerFor(t);
  controller.install();

  token._onDragLeftStart({});
  globalThis.canvas.mousePosition = { x: 400, y: 0 };
  token._onDragLeftMove({});

  // The separate movement application owns turn resources; the drag reports
  // distance but must always reach the cursor when the route is legal.
  assert.equal(controller.session.budget, undefined);
  assert.equal(controller.session.movementLimit, null);
  assert.ok(Math.abs(controller.session.appliedCenter.x - 400) < 0.001);
});

test("the active movement action is carried into committed waypoints", (t) => {
  const token = hero();
  token.document.movementAction = "fly";
  installFoundryMock({ tokens: [token] });
  const { controller } = controllerFor(t);
  controller.install();

  assert.equal(getMovementAction(token), "fly");

  token._onDragLeftStart({});
  globalThis.canvas.mousePosition = { x: 400, y: 0 };
  token._onDragLeftMove({});
  token._onDragLeftDrop({});

  assert.ok(token.committedWaypoints.length > 0);
  for (const waypoint of token.committedWaypoints) {
    assert.equal(waypoint.action, "fly");
  }
});

test("a gap the token fits through does not limit the route", (t) => {
  const token = new FakeToken({ id: "hero", x: -450, y: -50, movementSpeed: 5 });
  installFoundryMock({ walls: gapRoom(140), tokens: [token] });
  const { controller, preview } = controllerFor(t);
  controller.install();

  token._onDragLeftStart({});
  globalThis.canvas.mousePosition = { x: 0, y: 0 };
  token._onDragLeftMove({});

  assert.equal(preview.last.status, "normal");
  assert.ok(Math.abs(controller.session.appliedCenter.x) < 0.001, "the 140 px gap fits the 100 px token");
});

test("a gap below 75% of the token stops the preview before the wall", (t) => {
  const token = new FakeToken({ id: "hero", x: -450, y: -50, movementSpeed: 5 });
  installFoundryMock({ walls: gapRoom(70), tokens: [token] });
  const { controller, preview } = controllerFor(t);
  controller.install();

  token._onDragLeftStart({});
  globalThis.canvas.mousePosition = { x: 0, y: 0 };
  token._onDragLeftMove({});

  assert.equal(preview.last.status, "impassable");
  assert.ok(controller.session.appliedCenter.x < -225, `stopped before the gap, got ${controller.session.appliedCenter.x}`);
  assert.ok(controller.session.appliedCenter.x > -260, `should stop at body clearance, got ${controller.session.appliedCenter.x}`);
});

test("a larger token is stopped by a gap a smaller token passes", (t) => {
  const large = new FakeToken({ id: "large", x: -450, y: -110, widthPx: 220, heightPx: 220 });
  installFoundryMock({ walls: gapRoom(140), tokens: [large] });
  const { controller } = controllerFor(t);
  controller.install();

  large._onDragLeftStart({});
  globalThis.canvas.mousePosition = { x: 0, y: 0 };
  large._onDragLeftMove({});

  assert.ok(
    controller.session.appliedCenter.x < -275 && controller.session.appliedCenter.x > -300,
    `220 px token should stop at the gap, got ${controller.session.appliedCenter.x}`
  );
});

test("the passage profile uses the document's actual pixel size, not art scale", (t) => {
  const token = hero();
  token.document.getSize = () => ({ width: 140, height: 140 });
  token.document.texture = { scaleX: 0.5, scaleY: 0.5 };
  installFoundryMock({ tokens: [token] });
  const { controller } = controllerFor(t);
  controller.install();

  token._onDragLeftStart({});
  assert.equal(controller.session.radius, 70);
  assert.equal(controller.session.passageRadius, 52.5);
  assert.equal(controller.session.widthPx, 140);
  assert.equal(controller.session.heightPx, 140);
});

test("a movement-limiter budget stops a rerouted path at the remaining distance", (t) => {
  const token = new FakeToken({ id: "hero", x: -450, y: -50, movementSpeed: 30 });
  installFoundryMock({
    walls: [{ id: "barrier", c: [0, -300, 0, 300], move: 1, door: 0, ds: 0 }],
    tokens: [token]
  });
  installMovementLimiter({ remaining: 25, speed: 30, action: "walk" });
  const { controller, preview } = controllerFor(t);
  controller.install();

  token._onDragLeftStart({});
  globalThis.canvas.mousePosition = { x: 400, y: 0 };
  token._onDragLeftMove({});

  assert.equal(preview.last.status, "limited");
  assert.ok(preview.last.movementLimit.exhausted);
  assert.ok(Math.abs(preview.last.totalDistance - 25) < 1e-6);
  assert.ok(pathLength(controller.session.commitPoints) <= 500.001, "route must fit the 25 ft budget");

  token._onDragLeftDrop({});
  const committed = token.committedWaypoints;
  assert.ok(committed.length > 0);
  const centers = committed.map((waypoint) => ({ x: waypoint.x + 50, y: waypoint.y + 50 }));
  assert.ok(pathLength([{ x: -400, y: 0 }, ...centers]) <= 500.001);
  assert.ok(Math.hypot(committed.at(-1).x - 400, committed.at(-1).y + 50) > 1, "must stop short of the cursor");
});

test("a movement budget also truncates a rotation route", (t) => {
  const moving = new FakeToken({ id: "hero", x: 100, y: -50 });
  const goblin = new FakeToken({ id: "goblin", x: 200, y: -50, disposition: -1 });
  installFoundryMock({ tokens: [moving, goblin] });
  installMovementLimiter({ remaining: 2, speed: 30, action: "walk" });
  const { controller, preview } = controllerFor(t);
  controller.install();

  moving._onDragLeftStart({});
  globalThis.canvas.mousePosition = { x: 250, y: -50 };
  moving._onDragLeftMove({});

  assert.equal(controller.session.rotationEnemyId, "goblin");
  assert.equal(preview.last.status, "limited");
  assert.ok(Math.abs(preview.last.totalDistance - 2) < 1e-6);
  assert.ok(pathLength(controller.session.commitPoints) <= 40.001);
  assert.ok(pathLength(controller.session.commitPoints) < 100, "the full quarter arc must not be committed");
  const fromEnemy = Math.hypot(
    controller.session.appliedCenter.x - goblin.center.x,
    controller.session.appliedCenter.y - goblin.center.y
  );
  assert.ok(Math.abs(fromEnemy - 100) < 1, `rotation must stay on the perimeter, got ${fromEnemy}`);
});

test("a budget of zero keeps the drag at its origin", (t) => {
  const token = hero();
  installFoundryMock({ tokens: [token] });
  installMovementLimiter({ remaining: 0, speed: 30, action: "walk" });
  const { controller, preview } = controllerFor(t);
  controller.install();

  token._onDragLeftStart({});
  globalThis.canvas.mousePosition = { x: 400, y: 0 };
  token._onDragLeftMove({});

  assert.equal(preview.last.status, "limited");
  assert.equal(controller.session.appliedCenter.x, 0);

  token._onDragLeftDrop({});
  assert.deepEqual(token.committedWaypoints, []);
});

test("an inactive or unconstrained movement limiter does not clamp", (t) => {
  const inactive = hero();
  installFoundryMock({ tokens: [inactive] });
  installMovementLimiter({ remaining: 5, speed: 30 }, { active: false });
  const first = controllerFor(t);
  first.controller.install();
  inactive._onDragLeftStart({});
  globalThis.canvas.mousePosition = { x: 400, y: 0 };
  inactive._onDragLeftMove({});
  assert.ok(Math.abs(first.controller.session.appliedCenter.x - 400) < 0.001);
  first.controller.uninstall();

  const unconstrained = hero();
  installFoundryMock({ tokens: [unconstrained] });
  installMovementLimiter({ remaining: Infinity, speed: 30 });
  const second = controllerFor(t);
  second.controller.install();
  unconstrained._onDragLeftStart({});
  globalThis.canvas.mousePosition = { x: 400, y: 0 };
  unconstrained._onDragLeftMove({});
  assert.ok(Math.abs(second.controller.session.appliedCenter.x - 400) < 0.001);
});
