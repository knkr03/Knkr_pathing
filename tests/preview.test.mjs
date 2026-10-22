// AI notice: created with AI assistance (Freebuff / Codebuff). See NOTICE.md.
import assert from "node:assert/strict";
import test from "node:test";
import { PreviewRenderer } from "../src/foundry/preview.mjs";

class FakeGraphics {
  constructor() {
    this.calls = [];
  }

  clear() {
    this.calls.push(["clear"]);
  }

  lineStyle(...args) {
    this.calls.push(["lineStyle", ...args]);
  }

  beginFill(...args) {
    this.calls.push(["beginFill", ...args]);
  }

  endFill() {
    this.calls.push(["endFill"]);
  }

  moveTo(...args) {
    this.calls.push(["moveTo", ...args]);
  }

  lineTo(...args) {
    this.calls.push(["lineTo", ...args]);
  }

  drawCircle(...args) {
    this.calls.push(["drawCircle", ...args]);
  }
}

class FakeContainer {
  constructor() {
    this.children = [];
    this.parent = null;
    this.destroyed = false;
  }

  addChild(child) {
    this.children.push(child);
    child.parent = this;
    return child;
  }

  removeChild(child) {
    this.children = this.children.filter((entry) => entry !== child);
    child.parent = null;
  }

  destroy() {
    this.destroyed = true;
    this.children = [];
  }
}

class FakeText {
  constructor(text, style) {
    this.text = text;
    this.style = { ...style };
    this.visible = true;
    this.width = 120;
    this.position = {
      value: { x: 0, y: 0 },
      set(x, y) {
        this.value = { x, y };
      }
    };
  }
}

function installPixiMock() {
  globalThis.PIXI = { Container: FakeContainer, Graphics: FakeGraphics, Text: FakeText };
  const interfaceContainer = new FakeContainer();
  globalThis.canvas = {
    interface: interfaceContainer,
    dimensions: { width: 1920, height: 1080 }
  };
  globalThis.game = { i18n: { localize: (key) => key } };
  return interfaceContainer;
}

function plan(overrides = {}) {
  return {
    status: "normal",
    routeMode: "normal",
    start: { x: 0, y: 0 },
    points: [{ x: 0, y: 0 }, { x: 100, y: 0 }],
    segments: [
      {
        a: { x: 0, y: 0 },
        b: { x: 100, y: 0 },
        distance: 5,
        cost: 5,
        mode: "normal"
      }
    ],
    endpoint: { x: 100, y: 0 },
    goal: { x: 200, y: 0 },
    totalDistance: 5,
    totalCost: 5,
    ...overrides
  };
}

test("preview attaches, draws the route and label, clears, and detaches", () => {
  const parent = installPixiMock();
  const renderer = new PreviewRenderer();

  assert.equal(renderer.attach(), true);
  assert.equal(parent.children.length, 1);
  assert.equal(renderer.container.name, "knkr-pathing-preview");

  renderer.draw(plan(), {
    units: "ft",
    showDistanceLabel: true,
    appliedCenter: { x: 90, y: 0 }
  });

  assert.ok(renderer.graphics.calls.length > 0);
  assert.equal(renderer.label.visible, true);
  assert.match(renderer.label.text, /5 ft/);

  renderer.clear();
  assert.equal(renderer.label.visible, false);
  assert.equal(renderer.graphics.calls.filter(([name]) => name === "clear").length, 2);

  renderer.detach();
  assert.equal(renderer.container, null);
  assert.equal(parent.children.length, 0);
});

test("a plan without costed segments still draws its polyline", () => {
  const parent = installPixiMock();
  const renderer = new PreviewRenderer();
  renderer.attach();

  renderer.draw(
    plan({
      routeMode: "rotation",
      segments: null,
      points: [{ x: 0, y: 0 }, { x: 50, y: 40 }, { x: 100, y: 90 }],
      endpoint: { x: 100, y: 90 }
    }),
    { units: "ft", showDistanceLabel: false }
  );

  const lineCalls = renderer.graphics.calls.filter(([name]) => name === "lineTo");
  assert.ok(lineCalls.length >= 4, `expected outline and route strokes, got ${lineCalls.length}`);

  // A malformed segment list must not suppress the polyline fallback.
  renderer.draw(
    plan({
      segments: [{ mode: "blocked" }],
      points: [{ x: 0, y: 0 }, { x: 20, y: 20 }]
    }),
    { units: "ft", showDistanceLabel: false }
  );
  assert.ok(renderer.graphics.calls.some(([name]) => name === "lineTo"));

  renderer.detach();
  assert.equal(parent.children.length, 0);
});

test("a limited plan uses the amber route and movement-limit label", () => {
  const parent = installPixiMock();
  const renderer = new PreviewRenderer();
  renderer.attach();

  renderer.draw(
    plan({
      status: "limited",
      routeMode: "limited",
      endpoint: { x: 100, y: 0 },
      movementLimit: { remaining: 5, distance: 5, remainingAfter: 0, exhausted: true }
    }),
    { units: "ft", showDistanceLabel: true }
  );

  assert.equal(renderer.label.visible, true);
  assert.match(renderer.label.text, /Movement limit/);
  assert.match(renderer.label.text, /5 ft/);
  assert.ok(
    renderer.graphics.calls.some(([name, , color]) => name === "lineStyle" && color === 0xffc857),
    "limited routes should use the amber route color"
  );

  renderer.detach();
  assert.equal(parent.children.length, 0);
});

test("a blocked preview marks its potential stopping point", () => {
  const parent = installPixiMock();
  const renderer = new PreviewRenderer();
  renderer.attach();

  renderer.draw(
    plan({
      status: "impassable",
      routeMode: "impassable",
      start: { x: -400, y: 0 },
      points: [{ x: -400, y: 0 }, { x: -250, y: 0 }],
      segments: [
        { a: { x: -400, y: 0 }, b: { x: -250, y: 0 }, distance: 7.5, cost: 7.5, mode: "normal" }
      ],
      endpoint: { x: -250, y: 0 },
      goal: { x: 0, y: 0 },
      totalDistance: 7.5
    }),
    { units: "ft", showDistanceLabel: true }
  );

  assert.ok(
    renderer.graphics.calls.some(([name, x, y]) => name === "drawCircle" && x === -250 && y === 0),
    "the reachable endpoint must use the same marker as a normal route"
  );
  assert.match(renderer.label.text, /Potential move/);

  renderer.detach();
  assert.equal(parent.children.length, 0);
});

test("blocked preview draws a terminal indicator and hides its label when asked", () => {
  const parent = installPixiMock();
  const renderer = new PreviewRenderer();
  renderer.attach();

  renderer.draw(
    plan({
      status: "impassable",
      routeMode: "impassable",
      segments: [],
      endpoint: { x: 0, y: 0 }
    }),
    { units: "ft", showDistanceLabel: true }
  );

  assert.equal(renderer.label.visible, true);
  assert.match(renderer.label.text, /Blocked/);
  assert.ok(renderer.graphics.calls.some(([name]) => name === "lineTo"));

  renderer.draw(plan(), { units: "ft", showDistanceLabel: false });
  assert.equal(renderer.label.visible, false);

  renderer.detach();
  assert.equal(parent.children.length, 0);
});
