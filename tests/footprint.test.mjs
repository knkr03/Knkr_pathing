// AI notice: created with AI assistance (Freebuff / Codebuff). See NOTICE.md.
import assert from "node:assert/strict";
import test from "node:test";
import {
  createFootprint,
  normalizeGapRatio,
  resolveGapRatio,
  resolvePassageProfile
} from "../src/core/footprint.mjs";

test("clearance comes from the larger token dimension", () => {
  assert.equal(createFootprint({ widthPx: 100, heightPx: 100 }).radius, 50);
  assert.equal(createFootprint({ widthPx: 200, heightPx: 100 }).radius, 100);
  assert.equal(createFootprint({ widthPx: 100, heightPx: 300 }).radius, 150);
});

test("texture scale is applied to the displayed size", () => {
  assert.equal(createFootprint({ widthPx: 100, heightPx: 100, textureScaleX: 1.5 }).radius, 75);
  assert.equal(
    createFootprint({ widthPx: 100, heightPx: 100, textureScaleX: 0.5, textureScaleY: 0.5 }).radius,
    25
  );
});

test("the default gap ratio is 75% and keeps full body clearance", () => {
  const profile = resolvePassageProfile({ widthPx: 100, heightPx: 100 });
  assert.equal(profile.radius, 50);
  assert.equal(profile.baseRadius, 50);
  assert.equal(profile.diameter, 100);
  assert.equal(profile.passageRadius, 37.5);
  assert.equal(profile.passageDiameter, 75);
  assert.equal(profile.gapRatio, 0.75);
  assert.equal(profile.gapRatioSource, "default");
  assert.equal(profile.factor, 1);
  assert.deepEqual(profile.tags, []);
  assert.deepEqual(profile.appliedTags, []);
});

test("an unregistered tag does not grant a passage exception", () => {
  const profile = resolvePassageProfile({
    widthPx: 100,
    heightPx: 100,
    tags: ["amorphous"],
    exceptions: {}
  });
  assert.equal(profile.radius, 50);
  assert.equal(profile.factor, 1);
});

test("a registered tag factor narrows the clearance", () => {
  const profile = resolvePassageProfile({
    widthPx: 100,
    heightPx: 100,
    tags: ["amorphous"],
    exceptions: { amorphous: { factor: 0.5 } }
  });
  assert.equal(profile.baseRadius, 50);
  assert.equal(profile.radius, 25);
  assert.equal(profile.diameter, 50);
  assert.equal(profile.passageRadius, 18.75);
  assert.equal(profile.passageDiameter, 37.5);
  assert.deepEqual(profile.appliedTags, ["amorphous"]);
});

test("the narrowest registered tag wins", () => {
  const profile = resolvePassageProfile({
    widthPx: 100,
    heightPx: 100,
    tags: ["amorphous", "incorporeal"],
    exceptions: { amorphous: { factor: 0.75 }, incorporeal: 0.25 }
  });
  assert.equal(profile.radius, 12.5);
  assert.equal(profile.factor, 0.25);
  assert.equal(profile.passageRadius, 9.375);
  assert.deepEqual(profile.appliedTags, ["amorphous", "incorporeal"]);
});

test("tag factors are clamped at 1 so tags cannot widen a token", () => {
  const profile = resolvePassageProfile({
    widthPx: 100,
    heightPx: 100,
    tags: ["large"],
    exceptions: { large: { factor: 2 } }
  });
  assert.equal(profile.radius, 50);
  assert.equal(profile.passageRadius, 37.5);
  assert.deepEqual(profile.appliedTags, []);
});

test("duplicate and blank tags are ignored", () => {
  const profile = resolvePassageProfile({
    widthPx: 100,
    heightPx: 100,
    tags: ["amorphous", " ", "amorphous"],
    exceptions: { amorphous: { factor: 0.5 } }
  });
  assert.deepEqual(profile.tags, ["amorphous"]);
  assert.equal(profile.radius, 25);
});

test("the default gap ratio is adjustable for every size", () => {
  const profile = resolvePassageProfile({
    widthPx: 100,
    heightPx: 100,
    gapRatio: 0.5
  });
  assert.equal(profile.radius, 50);
  assert.equal(profile.passageRadius, 25);
  assert.equal(profile.passageDiameter, 50);
  assert.equal(profile.gapRatio, 0.5);
});

test("a per-size override wins over the default", () => {
  const profile = resolvePassageProfile({
    widthPx: 200,
    heightPx: 200,
    sizeKey: "large",
    gapRatio: 0.75,
    gapRatioOverrides: { large: 0.6 }
  });
  assert.equal(profile.radius, 100);
  assert.equal(profile.passageRadius, 60);
  assert.equal(profile.gapRatio, 0.6);
  assert.equal(profile.gapRatioSource, "size");
  assert.equal(profile.sizeKey, "large");
});

test("an invalid or disabled per-size override falls back to the default", () => {
  const zero = resolvePassageProfile({
    widthPx: 100,
    heightPx: 100,
    sizeKey: "medium",
    gapRatio: 0.75,
    gapRatioOverrides: { medium: 0 }
  });
  assert.equal(zero.gapRatio, 0.75);
  assert.equal(zero.gapRatioSource, "default");

  const invalid = resolveGapRatio({
    gapRatio: 0.75,
    sizeKey: "medium",
    overrides: { medium: "no" }
  });
  assert.equal(invalid.ratio, 0.75);
  assert.equal(invalid.source, "default");
});

test("gap ratios outside (0, 1] are normalized safely", () => {
  assert.equal(normalizeGapRatio(undefined), 0.75);
  assert.equal(normalizeGapRatio(0), 0.75);
  assert.equal(normalizeGapRatio(-2), 0.75);
  assert.equal(normalizeGapRatio(2), 1);
  assert.equal(normalizeGapRatio("0.4"), 0.4);
});
