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
    status: "squeeze",
    routeMode: "squeeze",
    points: [{ x: 0, y: 0 }, { x: 100, y: 0 }],
    segments: [
      {
        a: { x: 0, y: 0 },
        b: { x: 100, y: 0 },
        distance: 5,
        cost: 7,
        mode: "squeeze"
      }
    ],
    markers: [{ x: 40, y: 0, radius: 15 }],
    endpoint: { x: 100, y: 0 },
    goal: { x: 200, y: 0 },
    totalDistance: 5,
    totalCost: 7,
    squeezeDistance: 2,
    ...overrides
  };
}

test("preview attaches, draws paths/markers/labels, clears, and detaches", () => {
  const parent = installPixiMock();
  const renderer = new PreviewRenderer();

  assert.equal(renderer.attach(), true);
  assert.equal(parent.children.length, 1);
  assert.equal(renderer.container.name, "knkr-pathing-preview");

  renderer.draw(plan(), {
    units: "ft",
    showCostLabel: true,
    squeezeMultiplier: 2,
    squeezeActive: false,
    appliedCenter: { x: 90, y: 0 }
  });

  assert.ok(renderer.graphics.calls.length > 0);
  assert.ok(renderer.markers.calls.length > 0);
  assert.equal(renderer.label.visible, true);
  assert.match(renderer.label.text, /7 ft/);

  renderer.clear();
  assert.equal(renderer.label.visible, false);
  assert.equal(renderer.graphics.calls.filter(([name]) => name === "clear").length, 2);

  renderer.detach();
  assert.equal(renderer.container, null);
  assert.equal(parent.children.length, 0);
});

test("blocked preview draws a terminal indicator and hides markers while squeezing", () => {
  const parent = installPixiMock();
  const renderer = new PreviewRenderer();
  renderer.attach();

  renderer.draw(
    plan({
      status: "impassable",
      routeMode: "impassable",
      markers: [],
      endpoint: { x: 0, y: 0 },
      totalCost: 5
    }),
    { units: "ft", showCostLabel: true, squeezeActive: false }
  );

  assert.ok(renderer.graphics.calls.some(([name]) => name === "lineTo"));
  assert.equal(
    renderer.markers.calls.filter(([name]) => name !== "clear").length,
    0
  );

  renderer.draw(plan(), {
    units: "ft",
    showCostLabel: false,
    squeezeActive: true
  });
  assert.equal(renderer.label.visible, false);
  assert.equal(
    renderer.markers.calls.filter(([name]) => name !== "clear").length,
    0,
    "markers hidden after committing"
  );

  renderer.detach();
  assert.equal(parent.children.length, 0);
});
