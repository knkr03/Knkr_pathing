// AI notice: created with AI assistance (Freebuff / Codebuff). See NOTICE.md.
import assert from "node:assert/strict";
import test from "node:test";
import { DragController, DRAG_METHODS } from "../src/foundry/drag-controller.mjs";
import {
  WallCache,
  clearPassageException,
  registerPassageException
} from "../src/foundry/adapters.mjs";
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
  const controller = new DragController({ preview, wallCache: new WallCache() });
  testContext.after(() => controller.uninstall());
  return { controller, preview };
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

/** The v13 drag moves the preview clone; the session records the legal center. */
function applied(token, controller) {
  return controller.session.appliedCenter;
}

/** Closed room with a central opening in its left wall. */
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

/** A fully sealed room; the goal inside has no route. */
function sealedRoom() {
  return [
    { id: "room-top", c: [-200, -200, 200, -200], move: 1, door: 0, ds: 0 },
    { id: "room-right", c: [200, -200, 200, 200], move: 1, door: 0, ds: 0 },
    { id: "room-bottom", c: [200, 200, -200, 200], move: 1, door: 0, ds: 0 },
    { id: "room-left", c: [-200, 200, -200, -200], move: 1, door: 0, ds: 0 }
  ];
}

/** Corridor split by a baffle, leaving a node-to-wall gap at the bottom. */
function baffleCorridor(gap = 60) {
  return [
    { id: "top", c: [-300, 0, 300, 0], move: 1, door: 0, ds: 0 },
    { id: "bottom", c: [-300, 120, 300, 120], move: 1, door: 0, ds: 0 },
    { id: "left", c: [-300, 0, -300, 120], move: 1, door: 0, ds: 0 },
    { id: "right", c: [300, 0, 300, 120], move: 1, door: 0, ds: 0 },
    { id: "baffle", c: [0, 0, 0, 120 - gap], move: 1, door: 0, ds: 0 }
  ];
}

/** The live test scene's 77.5 px node-to-node gap and nearby return wall. */
function liveSceneWalls() {
  return [
    { id: "lower", c: [3900, 1970, 3900, 2400], move: 20, door: 0, ds: 0 },
    { id: "upper", c: [3891, 1893, 3900, 1171], move: 20, door: 0, ds: 0 },
    { id: "return", c: [4019, 1904, 4300, 1900], move: 20, door: 0, ds: 0 }
  ];
}

/** A doorway with short perpendicular jamb returns on both sides. */
function jambedGapRoom(gap, depth = 60) {
  const half = gap / 2;
  return [
    ...gapRoom(gap),
    { id: "jamb-top", c: [-200, -half, -200 + depth, -half], move: 1, door: 0, ds: 0 },
    { id: "jamb-bottom", c: [-200, half, -200 + depth, half], move: 1, door: 0, ds: 0 }
  ];
}

test("the passage radius is derived from the token's size", (t) => {
  const moving = tokenAt("hero", -400, 0);
  installFoundryMock({ tokens: [moving] });
  const { controller } = createController(t);
  assert.equal(controller.install(), true);

  moving._onDragLeftStart({});
  assert.ok(controller.session, "drag session should exist");
  assert.equal(controller.session.origin.x, -400);
  assert.equal(controller.session.radius, 50);
  assert.equal(controller.session.passageRadius, 37.5);
  assert.equal(controller.session.passage.baseRadius, 50);
  assert.equal(controller.session.passage.gapRatio, 0.75);
  assert.deepEqual(controller.session.passage.appliedTags, []);
});

test("a token is stopped before a gap below 75% of its size", (t) => {
  const moving = tokenAt("hero", -400, 0);
  installFoundryMock({ walls: gapRoom(70), tokens: [moving] });
  const { controller, preview } = createController(t);
  controller.install();

  moving._onDragLeftStart({});
  dragTo(moving, controller, { x: 0, y: 0 });

  assert.equal(preview.last.plan.status, "impassable");
  assert.ok(applied(moving, controller).x < -225, `preview should stop before the gap, got ${applied(moving, controller).x}`);
  assert.ok(applied(moving, controller).x > -260, "preview should reach the body wall clearance");

  // Dropping commits only the legal approach, never the cursor position.
  moving._onDragLeftDrop({});
  assert.equal(controller.session, null);
  assert.ok(moving.committedWaypoints.length >= 1);
  assert.ok(moving.droppedCenter.x < -225);
});

test("a sealed destination still moves and commits the potential partial route", (t) => {
  const moving = tokenAt("hero", -400, 0);
  installFoundryMock({ walls: sealedRoom(), tokens: [moving] });
  const { controller, preview } = createController(t);
  controller.install();

  moving._onDragLeftStart({});
  dragTo(moving, controller, { x: 0, y: 0 });

  assert.equal(preview.last.plan.status, "impassable");
  assert.ok(preview.last.plan.points.length >= 2, "the preview must show the potential move");
  assert.ok(Math.abs(applied(moving, controller).x + 250) < 1, `expected x≈-250, got ${applied(moving, controller).x}`);

  moving._onDragLeftDrop({});
  assert.equal(controller.session, null);
  assert.ok(moving.committedWaypoints.length >= 1);
  assert.ok(moving.droppedCenter.x < -200, `the token should move to the wall, got ${moving.droppedCenter.x}`);
});

test("a token passes a gap at least 75% of its width", (t) => {
  const moving = tokenAt("hero", -400, 0);
  installFoundryMock({ walls: gapRoom(140), tokens: [moving] });
  const { controller, preview } = createController(t);
  controller.install();

  moving._onDragLeftStart({});
  dragTo(moving, controller, { x: 0, y: 0 });

  assert.equal(preview.last.plan.status, "normal");
  assert.ok(Math.abs(applied(moving, controller).x) < 0.001);
  assert.ok(Math.abs(applied(moving, controller).y) < 0.001);

  moving._onDragLeftDrop({});
  assert.equal(moving.committedWaypoints.length, 1, "a straight route commits its destination waypoint");
  assert.ok(Math.abs(moving.committedWaypoints[0].x + 50) < 1, "waypoints are document top-left positions");
  assert.equal(
    moving.committedMovement.constrainOptions.ignoreWalls,
    true,
    "Foundry must not re-run its full-footprint wall pass over the planned route"
  );
});

test("a 75% gap is passable at an off-axis approach", (t) => {
  const moving = tokenAt("hero", -400, 0);
  installFoundryMock({ walls: gapRoom(75), tokens: [moving] });
  const { controller, preview } = createController(t);
  controller.install();

  moving._onDragLeftStart({});
  dragTo(moving, controller, { x: 100, y: 50 });

  assert.equal(preview.last.plan.status, "normal");
  assert.ok(Math.abs(applied(moving, controller).x - 100) < 0.001);
  assert.ok(Math.abs(applied(moving, controller).y - 50) < 0.001);
});

test("an exact-width gap remains passable", (t) => {
  const moving = tokenAt("hero", -400, 0);
  installFoundryMock({ walls: gapRoom(100), tokens: [moving] });
  const { controller, preview } = createController(t);
  controller.install();

  moving._onDragLeftStart({});
  dragTo(moving, controller, { x: 100, y: 50 });

  assert.equal(preview.last.plan.status, "normal");
  assert.ok(Math.abs(applied(moving, controller).x - 100) < 0.001);
  assert.ok(Math.abs(applied(moving, controller).y - 50) < 0.001);
});

test("a 4 ft doorway with jamb walls passes a 5 ft token at 75%", (t) => {
  const moving = tokenAt("hero", -400, 0);
  installFoundryMock({ walls: jambedGapRoom(80), tokens: [moving] });
  const { controller, preview } = createController(t);
  controller.install();

  moving._onDragLeftStart({});
  assert.equal(controller.session.passage.gapRatio, 0.75);
  dragTo(moving, controller, { x: 0, y: 0 });

  assert.equal(preview.last.plan.status, "normal");
  assert.ok(Math.abs(applied(moving, controller).x) < 0.001);

  moving._onDragLeftDrop({});
  assert.ok(moving.committedWaypoints.length > 0);
  assert.ok(Math.abs(moving.droppedCenter.x) < 1, `expected a full crossing, got ${moving.droppedCenter.x}`);
  assert.equal(moving.committedMovement.constrainOptions.ignoreWalls, true);
});

test("a 25% override squeezes a 5 ft token through a 4 ft doorway", (t) => {
  const moving = tokenAt("hero", -400, 0);
  moving.actor.system.traits = { size: "med" };
  installFoundryMock({
    walls: jambedGapRoom(80),
    tokens: [moving],
    settings: { gapClearanceMedium: 0.25 }
  });
  const { controller, preview } = createController(t);
  controller.install();

  moving._onDragLeftStart({});
  assert.equal(controller.session.passage.gapRatio, 0.25);
  assert.equal(controller.session.passage.passageRadius, 12.5);
  dragTo(moving, controller, { x: 0, y: 0 });

  assert.equal(preview.last.plan.status, "normal");
  assert.ok(Math.abs(applied(moving, controller).x) < 0.001);
});

test("a 3 ft node-to-wall gap opens at a 0.5 default modifier", (t) => {
  const moving = tokenAt("hero", -150, 60);
  installFoundryMock({
    walls: baffleCorridor(60),
    tokens: [moving],
    settings: { gapClearance: 0.5 }
  });
  const { controller, preview } = createController(t);
  controller.install();

  moving._onDragLeftStart({});
  assert.equal(controller.session.passage.passageRadius, 25);
  dragTo(moving, controller, { x: 150, y: 60 });

  assert.equal(preview.last.plan.status, "normal");
  assert.ok(Math.abs(applied(moving, controller).x - 150) < 0.001);

  moving._onDragLeftDrop({});
  assert.ok(moving.committedWaypoints.length > 0);
  assert.ok(Math.abs(moving.droppedCenter.x - 150) < 1);
});

test("the live 77.5 px node-to-node gap passes at a 0.5 modifier", (t) => {
  const moving = tokenAt("hero", 3728, 1933);
  installFoundryMock({
    walls: liveSceneWalls(),
    tokens: [moving],
    settings: { gapClearance: 0.5 }
  });
  const { controller, preview } = createController(t);
  controller.install();

  moving._onDragLeftStart({});
  dragTo(moving, controller, { x: 3990, y: 1930 });

  assert.equal(preview.last.plan.status, "normal");
  assert.ok(Math.abs(applied(moving, controller).x - 3990) < 0.001);
  assert.ok(Math.abs(applied(moving, controller).y - 1930) < 0.001);
});

test("the raw cursor wins over a clamped drag-context destination", (t) => {
  const moving = tokenAt("hero", -400, 0);
  installFoundryMock({ walls: gapRoom(80), tokens: [moving] });
  const { controller } = createController(t);
  controller.install();

  moving._onDragLeftStart({});
  // Simulate another module clamping the context destination to the origin.
  moving._context.destination = { x: -450, y: -50 };
  controller.onDragMove(moving, { global: { x: 0, y: 0 } });

  assert.ok(Math.abs(controller.session.appliedCenter.x) < 0.001);
  assert.ok(Math.abs(controller.session.appliedCenter.y) < 0.001);
});

test("the preview clone refreshes position without a full state refresh", (t) => {
  const moving = tokenAt("hero", -400, 0);
  installFoundryMock({ tokens: [moving] });
  const { controller } = createController(t);
  controller.install();

  moving._onDragLeftStart({});
  moving._clone.renderFlagCalls.length = 0;
  dragTo(moving, controller, { x: 0, y: 0 });

  assert.ok(moving._clone.renderFlagCalls.length > 0);
  const flags = moving._clone.renderFlagCalls.at(-1);
  assert.equal(flags.refreshPosition, true);
  assert.equal(flags.refresh, undefined, "a full refresh fights the native preview and the combat turn marker");
});

test("a preview rendering failure does not end the drag session", (t) => {
  const moving = tokenAt("hero", -400, 0);
  installFoundryMock({ tokens: [moving] });
  const preview = {
    attach: () => true,
    clear: () => {},
    draw: () => { throw new Error("render failed"); }
  };
  const controller = new DragController({ preview, wallCache: new WallCache() });
  t.after(() => controller.uninstall());
  controller.install();

  moving._onDragLeftStart({});
  assert.doesNotThrow(() => dragTo(moving, controller, { x: 0, y: 0 }));
  assert.ok(controller.session, "planning must survive an overlay failure");
  assert.ok(Math.abs(applied(moving, controller).x) < 0.001);
});

test("a per-size gap override applies to the dragged token", (t) => {
  const moving = tokenAt("hero", -400, 0);
  moving.actor.system.traits = { size: "med" };
  installFoundryMock({
    walls: gapRoom(60),
    tokens: [moving],
    settings: { gapClearanceMedium: 0.5 }
  });
  const { controller, preview } = createController(t);
  controller.install();

  moving._onDragLeftStart({});
  assert.equal(controller.session.passage.sizeKey, "medium");
  assert.equal(controller.session.passage.gapRatio, 0.5);
  assert.equal(controller.session.passage.passageRadius, 25);
  dragTo(moving, controller, { x: 0, y: 0 });

  assert.equal(preview.last.plan.status, "normal");
  assert.ok(Math.abs(applied(moving, controller).x) < 0.001);
});

test("a larger token needs a wider gap", (t) => {
  const moving = tokenAt("hero", -400, 0, { widthPx: 200, heightPx: 200 });
  installFoundryMock({ walls: gapRoom(140), tokens: [moving] });
  const { controller, preview } = createController(t);
  controller.install();

  moving._onDragLeftStart({});
  assert.equal(controller.session.radius, 100);
  assert.equal(controller.session.passageRadius, 75);
  dragTo(moving, controller, { x: 0, y: 0 });

  assert.equal(preview.last.plan.status, "impassable");
  assert.ok(
    applied(moving, controller).x < -250 && applied(moving, controller).x > -290,
    `200 px token should stop just before the 140 px gap, got ${applied(moving, controller).x}`
  );
});

test("a registered tag exception lets a token use a narrower gap", (t) => {
  t.after(() => clearPassageException("amorphous"));
  assert.equal(registerPassageException("amorphous", 0.5), true);

  const moving = tokenAt("hero", -400, 0);
  moving.document.flags = { "knkr-pathing": { tags: ["amorphous"] } };
  installFoundryMock({ walls: gapRoom(80), tokens: [moving] });
  const { controller, preview } = createController(t);
  controller.install();

  moving._onDragLeftStart({});
  assert.equal(controller.session.radius, 25);
  assert.equal(controller.session.passageRadius, 18.75);
  assert.deepEqual(controller.session.passage.appliedTags, ["amorphous"]);

  dragTo(moving, controller, { x: 0, y: 0 });
  assert.equal(preview.last.plan.status, "normal");
  assert.ok(Math.abs(applied(moving, controller).x) < 0.001);
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
  assert.ok(Math.abs(applied(moving, controller).x - 150) < 0.5, `expected contact at 150, got ${applied(moving, controller).x}`);
  assert.ok(distance(applied(moving, controller), goblin.center) >= 99.5);
});

test("friendly tokens do not block", (t) => {
  const moving = tokenAt("hero", 0, 0);
  const friend = tokenAt("friend", 250, 0, { disposition: 1 });
  installFoundryMock({ tokens: [moving, friend] });
  const { controller } = createController(t);
  controller.install();

  moving._onDragLeftStart({});
  dragTo(moving, controller, { x: 400, y: 0 });
  assert.ok(Math.abs(applied(moving, controller).x - 400) < 0.001);
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
  assert.ok(Math.abs(applied(moving, controller).x - 250) < 0.5, `rotation x, got ${applied(moving, controller).x}`);
  assert.ok(Math.abs(applied(moving, controller).y + 100) < 0.5, `rotation y, got ${applied(moving, controller).y}`);
  assert.ok(distance(applied(moving, controller), goblin.center) >= 99.5, "must stay on the perimeter");
  assert.ok(controller.session.commitPoints.length > 1, "rotation routes are committable");

  dragTo(moving, controller, { x: 150, y: -200 });
  assert.equal(controller.session.rotationEnemyId, null);
  assert.ok(applied(moving, controller).y < -100, "ordinary pathfinding resumes after leaving the enemy");
});

test("rotation commits the shorter arc after the cursor crosses the enemy", (t) => {
  // Touching on the right side (angle 0); cursor then moves to the top and
  // finally to the bottom. The accumulated trace would be three quarters of
  // the perimeter, while the shortest route is a quarter turn downward.
  const moving = tokenAt("hero", 350, 0);
  const goblin = tokenAt("goblin", 250, 0, { disposition: -1 });
  installFoundryMock({ tokens: [moving, goblin] });
  const { controller } = createController(t);
  controller.install();

  moving._onDragLeftStart({});
  dragTo(moving, controller, { x: 250, y: -50 });
  dragTo(moving, controller, { x: 250, y: 50 });

  const route = controller.session.commitPoints;
  const minY = Math.min(...route.map((point) => point.y));
  assert.ok(minY >= -0.5, `committed route should not swing over the top, min y ${minY}`);

  let length = 0;
  for (let index = 1; index < route.length; index += 1) length += distance(route[index - 1], route[index]);
  assert.ok(length < 160, `expected a quarter turn (~157 px), got ${length}`);
  assert.ok(Math.abs(route.at(-1).y - 100) < 0.5, "route ends below the enemy");
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
  assert.ok(Math.abs(first._clone.center.x - 300) < 0.001);
  assert.ok(Math.abs(first._clone.center.y - 200) < 0.001);
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
  assert.ok(Math.abs(moving._clone.center.x - 300) < 0.001);
});

test("without an external budget, remaining movement never clamps the dragged position", (t) => {
  const moving = tokenAt("hero", 0, 0, { movementSpeed: 5 });
  installFoundryMock({ tokens: [moving] });
  const { controller, preview } = createController(t);
  controller.install();

  moving._onDragLeftStart({});
  dragTo(moving, controller, { x: 400, y: 0 });

  // Movement resources belong to a separate application; the drag only
  // reports distance.
  assert.equal(controller.session.budget, undefined);
  assert.equal(controller.session.movementLimit, null);
  assert.notEqual(preview.last.plan.status, "budget");
  assert.ok(Math.abs(applied(moving, controller).x - 400) < 0.001);
  assert.ok(preview.last.plan.totalDistance > 0);
});

test("a route with no legal movement commits nothing", (t) => {
  const moving = tokenAt("hero", 0, 0);
  installFoundryMock({ tokens: [moving] });
  const { controller } = createController(t);
  controller.install();

  // Dropping on the origin has no movable segment; Foundry must not receive a
  // waypoint list that would record a phantom movement.
  moving._onDragLeftStart({});
  dragTo(moving, controller, { x: 0, y: 0 });
  moving._onDragLeftDrop({});

  assert.equal(controller.session, null);
  assert.deepEqual(moving.committedWaypoints, []);
});

test("uninstall restores the original token drag handlers", (t) => {
  const moving = tokenAt("hero", 0, 0);
  installFoundryMock({ tokens: [moving] });
  const { controller } = createController(t);
  const originals = DRAG_METHODS.map((method) => FakeToken.prototype[method]);
  controller.install();
  for (const method of DRAG_METHODS) {
    assert.notEqual(FakeToken.prototype[method], originals[DRAG_METHODS.indexOf(method)]);
  }
  controller.uninstall();
  for (const method of DRAG_METHODS) {
    assert.equal(FakeToken.prototype[method], originals[DRAG_METHODS.indexOf(method)]);
  }
});
