# Architecture

> **AI notice:** This file was created with AI assistance. See [NOTICE.md](../NOTICE.md).

## Goals

- Keep planning logic pure, deterministic, and testable outside Foundry.
- Keep Foundry-specific code at the edges: adapters convert documents into plain geometry; the drag controller owns the interaction state; the renderer only draws.
- Never let rendering drive path computation. The planner returns a complete immutable plan; the renderer consumes it.

## Layers

```text
src/
  module.mjs                 Foundry entry point: hooks, settings, keybinding, install/uninstall
  constants.mjs              Module id, defaults, state enums
  settings.mjs               Settings registration and typed accessors
  compat.mjs                 Version/API detection and safe-disable checks
  foundry/
    adapters.mjs             Document -> plain geometry; wall cache; budget data; cursor
    drag-controller.mjs      Wraps token drag lifecycle; owns DragSession; commits constraints
    preview.mjs              PIXI overlay: path, markers, labels, blocked/contact states
  core/
    vec.mjs                  Vector helpers
    geometry.mjs             Distances, intersections, sampling, first-contact math
    walls.mjs                Wall normalization, blocking tests, bounds, pruning
    footprint.mjs            Token footprint and radius profiles
    pathfinder.mjs           Direct test + visibility graph + A* + smoothing
    squeeze.mjs              Clearance profile, squeeze runs, marker placement
    cost.mjs                 Per-segment modes/costs, totals, budget clamp
    enemies.mjs              Hostile filtering helpers, contact clamp, perimeter rotation
    planner.mjs              Orchestrates one movement plan (normal/squeeze/blocked/contact/budget)
tests/                       node:test suites for the core layer
scripts/                     Manifest validation and release packaging
```

Dependency direction: `core/*` imports only `core/*`; `foundry/*` imports `core/*`; `module.mjs` imports all. The core never reads `canvas`, `game`, `Hooks`, or `PIXI`.

## Planning pipeline

`planMovement()` is called with plain data:

```js
{
  start: {x, y},                  // drag origin, pixels
  goal: {x, y},                   // proposed destination, pixels
  walls: [{id, a: {x, y}, b: {x, y}}], // pre-filtered blocking walls
  normalRadius,                   // pixels
  squeezeRadius,                  // pixels
  enemies: [{id, center, radius}],// pixels, already filtered by disposition
  budget: number | null,          // scene units, remaining
  unitsPerPixel,                  // scene units per pixel
  squeezeMultiplier,
  markerDiameter,                 // pixels
  markerBackoff,                  // pixels
  maxWalls, maxWaypoints
}
```

Steps:

1. **Normal plan.** Direct visibility test first. If clear, the route is a single segment. Otherwise the visibility graph is built around expanded wall endpoints and searched with A*.
2. **Squeeze plan.** Only when the normal plan is incomplete: repeat with the squeeze radius. If complete, classify the narrow clearance runs and place markers.
3. **Segment accounting.** Sample clearance along every route segment. Segments below normal clearance are `squeeze` and get the multiplier; segments below squeeze clearance are invalid (should not occur).
4. **Enemy contact.** Find the earliest contact along the polyline against circular enemy footprints and truncate the route there. Contact takes precedence over squeeze/budget status.
5. **Budget clamp.** Walk the costed segments until the budget is exhausted; interpolate the final point. Status becomes `budget`.
6. **Markers.** Keep only markers before the final route distance so a marker behind an enemy or budget cutoff is not shown.

Returned plan:

```js
{
  status: 'normal' | 'squeeze' | 'contact' | 'budget' | 'impassable',
  points: [...],
  segments: [{a, b, distance, cost, multiplier, mode}],
  totalDistance, totalCost,       // scene units
  markers: [{x, y, radius}],      // pixels
  squeezeRuns: [...],
  contact: {enemyId, point} | null,
  budgetExhausted: boolean,
  normalReachable: boolean,
  squeezeReachable: boolean
}
```

## Interaction state machine

```text
idle
  -> dragging (drag start, gridless, single token)
       -> normal route                (normal plan complete)
       -> squeezeRequired             (normal incomplete, squeeze complete)
            -> squeezeCommitted       (constrained center enters a marker)
            -> back to normal         (normal plan becomes complete again)
       -> blocked                    (neither plan complete; partial path shown)
       -> enemyContact               (route truncated at hostile footprint)
            -> rotating              (cursor inside the touching enemy)
            -> normal/squeeze        (cursor leaves the enemy footprint)
  -> idle (drop or cancel)
```

The drag controller owns this state per drag. The planner is stateless.

## Drag integration

- On install, the controller wraps `Token.prototype._onDragLeftStart/_onDragLeftMove/_onDragLeftDrop/_onDragLeftCancel`, preserving and restoring the originals.
- The wrapper calls the original first, then reads the proposed center (the original handler has already positioned the token), plans from the drag origin, and writes the constrained top-left position back. This means the constraint is applied **during** dragging, and the core drop handler commits the already-constrained position.
- If the core drop method returns a promise, the module verifies the committed document center after it resolves. A mismatch is logged and corrected as a safety net; the primary mechanism never relies on post-placement correction.
- Replans are throttled by both pointer distance and a small time window, and the direct-path test runs before any graph construction.
- The module refuses to run when the required prototype methods are missing, when the scene is not gridless, or when more than one token is selected. It emits a clear notification instead of silently allowing illegal movement.
- libWrapper is not required. Conflicts with other modules that also wrap these methods are possible and documented; direct wrapping is restored on unload to reduce interference.

## Rendering

`PreviewRenderer` owns one `PIXI.Container` attached to `canvas.interface` after `canvasReady`, removed and destroyed on `canvasTearDown`. It draws:

- per-segment lines colored by mode (normal, squeezing, blocked),
- waypoint dots,
- squeeze markers with a halo and inner dot,
- a terminal indicator (contact bar, blocked ring, or budget cut),
- an optional cost label.

PIXI 7 API (`lineStyle`, `moveTo`, `lineTo`, `drawCircle`) is used because Foundry v13 remains on PIXI 7; a v8-style `stroke()` fallback exists for forward compatibility. All graphics are cleared every frame and the container is hidden whenever no drag is active.

## Caching and performance

- Blocking wall segments are cached per scene and invalidated by `createWall`, `updateWall`, `deleteWall`, `canvasReady`, and `canvasTearDown`.
- The planner prunes walls to a bounding box around the drag route, then to the nearest `maxWalls` by distance to the start→goal line; waypoints are capped by `maxWaypoints`.
- The direct-path test runs before graph construction on every frame.
- The drag controller skips replanning when the cursor has moved less than a small threshold, except when state needs to update (marker entry, rotation, squeeze activation).
- Rendering is a pure function of the returned plan and does no geometry work.

## Error handling

- All Foundry API touchpoints are guarded; a missing method yields a compatibility failure collected at startup and shown once.
- A planner exception during a drag is caught, logged, and the drag is left to core behavior for that frame rather than corrupting the token position.
- Settings changes re-register nothing but are read per frame, so toggling the module off mid-drag clears the preview and stops constraining.
