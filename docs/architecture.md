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
    adapters.mjs             Document -> plain geometry; wall cache; actual token size; movement action; external movement budget
    drag-controller.mjs      Wraps token drag lifecycle; owns DragSession; commits constraints
    preview.mjs              PIXI overlay: path, distance label, blocked/contact states
  core/
    vec.mjs                  Vector helpers
    geometry.mjs             Distances, intersections, sampling, first-contact math
    walls.mjs                Wall normalization, blocking tests, bounds, pruning
    footprint.mjs            Body clearance, configurable gap ratio, per-size overrides, tag exceptions
    pathfinder.mjs           Direct test + visibility graph + A* + smoothing
    cost.mjs                 Per-segment distances and totals
    enemies.mjs              Hostile filtering helpers, contact clamp, perimeter rotation
    planner.mjs              Orchestrates one movement plan (normal/limited/contact/blocked)
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
  radius,                         // full body clearance, pixels
  passageRadius,                  // reduced radius inside a gap, pixels
  enemies: [{id, center, radius}],// pixels, already filtered by disposition
  unitsPerPixel,                  // scene units per pixel
  maxDistance,                    // remaining scene units, or null for no external limit
  maxWalls, maxWaypoints
}
```

Steps:

1. **Path.** Direct visibility test first. If clear, the route is a single segment. Otherwise the visibility graph is built around expanded wall endpoints, **plus portal nodes for every opening at least `passageRadius * 2` wide**. Portals are generated from actual wall points: endpoint-to-endpoint gaps and endpoint-to-wall-face gaps. Each portal has a midpoint and two lead points on each side along the gap normal, so a short jambed doorway can be finished under reduced clearance instead of needing full body clearance while still between the jamb returns. Edges inside the portal ignore only its host walls and use the reduced passage radius, while every other edge uses the full body radius and tests every wall. Walls that merely touch the opening at a corner are not treated as closing it; only a wall crossing or ending inside the open span is rejected. Gaps narrower than the threshold produce no portal crossing, so an oversized token cannot pass, but their near-side lead points still provide a clean partial-route stop.
2. **Enemy contact.** Find the earliest contact along the polyline against circular enemy footprints and truncate the route there.
3. **External movement limit.** If `maxDistance` is finite, truncate the route to that many scene units with `limitRoute()`. Contact beyond the budget is discarded; contact inside the budget takes precedence. Without an external budget, this step is a no-op.
4. **Distance accounting.** Convert each polyline segment to scene units and total it. `cost` equals `distance`.

Returned plan:

```js
{
  status: 'normal' | 'limited' | 'contact' | 'impassable',
  routeMode: 'normal' | 'limited' | 'rotation' | 'impassable',
  points: [...],
  segments: [{a, b, distancePx, distance, cost}],
  totalDistance, totalCost,       // scene units (cost equals distance)
  contact: {enemyId, point} | null,
  movementLimit: {remaining, distance, remainingAfter, exhausted} | null,
  radius, passageRadius,
  reachable: boolean
}
```

## Interaction state machine

```text
idle
  -> dragging (drag start, gridless, single token)
       -> normal route                (route reaches the cursor)
       -> limited                    (external movement budget exhausted; route truncated)
       -> blocked                    (no route through a gap this token fits; partial path shown)
       -> enemyContact               (route truncated at hostile footprint)
            -> rotating              (cursor inside the touching enemy)
            -> normal                (cursor leaves the enemy footprint)
  -> idle (drop or cancel)
```

The drag controller owns this state per drag. The planner is stateless.

## Drag integration

- On install, the controller wraps `Token.prototype._initializeDragLeft`, `_updateDragDestination`, `_prepareDragLeftDropUpdates`, and `_finalizeDragLeft`, preserving and restoring the originals. These are the v13+ drag pipeline entry points.
- Foundry v13 does not move the token document while dragging: it clones the token into the preview layer and commits a waypoint list on drop through `TokenDocument#update({movement})`. The wrapper runs the original handler first, then plans from the **raw cursor** rather than the drag context's destination. Movement Limiter and similar modules rewrite that destination to clamp it, which would otherwise stop the route from tracking the pointer and make the native clone and the planned endpoint disagree every frame. The preview clone is then moved to the furthest legal center with a position-only refresh.
- The waypoint list in `_prepareDragLeftDropUpdates` is replaced with the planned route, so the committed movement is the same route the preview showed. The route keeps full body clearance outside measured openings. Because Foundry's native wall pass only understands the token's full footprint, the committed movement sets `constrainOptions.ignoreWalls = true`: the route was already wall-checked by this module, including its reduced-radius opening crossings. Bounds, movement cost, and dnd5e token blocking remain enabled.
- When `dnd5e-movement-limiter` is active, the controller snapshots its public `status(token).remaining` at drag start. The planner receives that as `maxDistance`; the route, preview endpoint, and committed waypoints all stop at the same budget. This preserves that module's straight-line clamp while allowing a wall-rerouted path to consume its budget correctly. The integration is read-only and absent-safe: no API, inactive module, or `Infinity` budget means no limit.
- `_finalizeDragLeft` covers both a committed drop and a cancelled drag; the session and overlay end in `_prepareDragLeftDropUpdates` on a successful drop, because core clears the preview without calling `_finalizeDragLeft` there.
- Rotation commits a single arc from the angle where the rotation began to the current perimeter position. The arc uses the signed shorter angular delta, so cursor wiggles and direction changes cannot record a longer way around the enemy.
- A late check compares the committed document center with the planned endpoint and logs a warning if Foundry's own constraint pass trimmed the route again.
- Replans are throttled by both pointer distance and a small time window, and the direct-path test runs before any graph construction.
- The module refuses to run when the required prototype methods are missing, when the scene is not gridless, or when more than one token is selected. It emits a clear notification instead of silently allowing illegal movement.
- libWrapper is not required. Conflicts with other modules that also wrap these methods are possible and documented; direct wrapping is restored on unload to reduce interference.

## Rendering

`PreviewRenderer` owns one `PIXI.Container` attached to `canvas.interface` after `canvasReady`, removed and destroyed on `canvasTearDown`. It draws:

- the route polyline in blue, amber when an external movement budget truncates it, with blocked segments overlaid in red,
- waypoint dots,
- a terminal indicator (contact bar or blocked cross),
- an optional distance label with `Blocked`, `Enemy contact`, or `Movement limit` status.

PIXI 7 API (`lineStyle`, `moveTo`, `lineTo`, `drawCircle`) is used because Foundry v13 remains on PIXI 7; a v8-style `stroke()` fallback exists for forward compatibility. The route is always stroked from the plan polyline first, then blocked segments are layered over it, so a plan without segments (rotation) or a malformed segment list still draws a line instead of only dots. Paths are committed with `finishPoly()` after each style group. All graphics are cleared every frame and the container is hidden whenever no drag is active.

## Caching and performance

- Blocking wall segments are cached per scene and invalidated by `createWall`, `updateWall`, `deleteWall`, `canvasReady`, and `canvasTearDown`.
- The planner prunes walls to a bounding box around the drag route, then to the nearest `maxWalls` by distance to the start→goal line; waypoints are capped by `maxWaypoints`.
- Passage candidates are built only from the retained nearby wall set and only for gaps up to a small multiple of the passage diameter, so doorway handling stays bounded on dense scenes.
- The direct-path test runs before graph construction on every frame.
- The drag controller skips replanning when the cursor has moved less than a small threshold, except when state needs to update (rotation start or end, wall changes).
- Rendering is a pure function of the returned plan and does no geometry work.

## Error handling

- All Foundry API touchpoints are guarded; a missing method yields a compatibility failure collected at startup and shown once.
- A planner exception during a drag is caught, logged, and the drag is left to core behavior for that frame rather than corrupting the token position.
- Settings changes re-register nothing but are read per frame, so toggling the module off mid-drag clears the preview and stops constraining.
