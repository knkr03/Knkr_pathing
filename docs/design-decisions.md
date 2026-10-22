# Design Decisions

> **AI notice:** This file was created with AI assistance. See [NOTICE.md](../NOTICE.md).

This document resolves §15 of the supplied design specification and records the deliberate limits of the 1.0.0 implementation. Each decision lists what is implemented, why, and what would be needed to change it.

## 1. Passage clearance

**Decision:** a token has two clearance values. Its **body radius** is half of its larger actual pixel dimension from `TokenDocument#getSize()`, and wall clearance everywhere outside an opening always uses that full radius. Its **gap width** is the token's actual width multiplied by an adjustable ratio, `0.75` by default. A 1×1 token on a 100 px / 5 ft grid therefore keeps 50 px wall clearance but may pass a 75 px (3.75 ft) opening.

The ratio can be changed for all sizes with **Default gap clearance**, and each D&D 5e size category (Tiny, Small, Medium, Large, Huge, Gargantuan) has an optional override. `0` means "use the default". Ratios are normalized to `(0, 1]` so a typo cannot widen a token past its body.

**Why:** the requested rule is that a passable gap is greater than token size × 0.75, with a global default and per-size exceptions. Reducing the wall radius globally would let a token clip every wall, so the reduced radius is confined to portal edges inside the measured opening. Ordinary approach and departure segments still use the body radius. The preview therefore stops at the opening when it is too narrow rather than hugging walls elsewhere.

**Gap measurement:** a wall opening is measured between its **actual wall points** — two wall endpoints, or an endpoint and the nearest point on an opposing wall face. The opening is compared directly with the token width × the resolved ratio, with only a `0.01` px floating-point tolerance. No waypoint offset or padding is subtracted from the opening. A portal has a midpoint and two lead points on each side of the opening along its normal; edges inside the portal ignore only its host walls and use the reduced passage radius. The extra lead points let a token finish leaving a short doorway whose jamb returns are deeper than one body radius. This lets the token cross and then leave toward a goal at any angle. A wall that merely touches an opening endpoint (a jamb meeting the wall) does not close it; only a wall crossing or ending inside the open span does. That keeps real doorways usable while still preventing a reduced-radius edge from tunnelling through a wall.

**Limit:** non-circular token footprints are approximated by a conservative circumscribed circle. Exact polygon/ellipse passage is out of scope.

## 2. Tag exceptions

**Decision:** passage exceptions are driven by **token tags**, but no exceptions ship by default. A tag rule is registered at runtime:

```js
game.modules.get("knkr-pathing").api.registerPassageException("amorphous", 0.5);
```

The factor multiplies the token's body radius and therefore its default gap width as well (`0.5` halves both). Tags are read from `TokenDocument#tags` when Foundry provides it and from the module flag on the token or actor (`flags.knkr-pathing.tags`). The narrowest registered factor wins, and factors are clamped at `1` so a tag can never widen a token. `clearPassageException(tag)` and `listPassageExceptions()` are also exposed. The per-size gap ratio is applied after the tag factor.

**Why:** the user asked for the framework to be ready for future token tags without committing to specific traits now. Registration keeps the core testable and lets another module (or a macro) define the actual game rule later. Unknown tags do nothing.

**Hook:** `Hooks.call("knkrPathingPassageProfile", token, profile)` runs after the profile is resolved, so another module can adjust `profile.radius` or `profile.passageRadius` for a rule this module does not know about.

## 3. Movement accounting

**Decision:** the module **reports** route distance and, when [D&D 5e Movement Limiter & Undo](https://github.com/knkr03/dnd5e-movement-limiter) is active, also **consumes that module's remaining budget**. Movement Limiter remains the single owner of turn resources.

- The preview label shows the physical route distance in scene units.
- The module does not read `TokenDocument#movementHistory` itself and does not maintain its own speed or spent-movement state.
- When Movement Limiter's public `api.status(token)` reports a finite `remaining`, that value is used as the maximum route length from the drag origin. The route is truncated by actual scene distance, and the preview and committed waypoints both stop at the same point.
- The truncation happens after pathfinding and after enemy contact clamping. If contact occurs before the budget, contact wins; if the budget ends first, the preview reports `limited` and the unseen contact is not reported.
- Rotation routes are limited from the drag origin across their full committed route (approach plus arc), not just the current arc.
- Without Movement Limiter, or when it reports `Infinity` (GM bypass, out-of-combat full allotment, teleport actions), the route is not clamped by this module.
- The token's active movement action (`walk`, `fly`, …) is copied into committed waypoints so core records the movement under the right action.

**Why:** Movement Limiter exposes only a read-only `status()` API; it has no path-clamp hook. Applying its budget to the actual path is required because a path rerouted around a wall is longer than the straight line Movement Limiter clamps. Without this, replacing the waypoint list in `_prepareDragLeftDropUpdates` would let a token move farther than its remaining movement. Reading the budget instead of recomputing movement history keeps a single authority and avoids double-counting. The budget is snapshotted at drag start, matching the snapshot Movement Limiter takes for the same drag.

**Known limit:** the module is gridless-only, while Movement Limiter can report budgets on any scene. Scene units are assumed to map to route length by `grid.distance / grid.size`, which is exact for gridless Euclidean movement. If another module changes Movement Limiter's budget mid-drag, the two snapshots can diverge; the module intentionally keeps the drag-start snapshot so it cannot move the goalposts during a drag.

## 4. Enemy classification

**Decision:** an enemy is selected by disposition, relative to the moving token's disposition, with a configurable policy:

| Setting | Included tokens |
| --- | --- |
| `hostile` (default) | Hostile tokens only. |
| `hostile-neutral` | Hostile and neutral tokens. |
| `non-friendly` | Every token whose disposition is not Friendly. |

Hidden tokens are excluded by default and can be included by setting. Defeated/incapacitated tokens are **not** automatically excluded: the disposition is the contract. Secret tokens are treated as hidden. A token never collides with itself. Friendly tokens are never obstacles under any policy. The moving token's own disposition is not otherwise interpreted (a hostile creature dragged by the GM still treats hostile tokens as enemies, which matches "hostile relative to the moving token" via the shared hostile disposition).

**Why:** conservative defaults avoid surprising friendly-fire collisions, and the policy setting resolves the neutral/unlinked case explicitly rather than guessing from actor types.

## 5. Enemy contact geometry

**Decision:** enemy contact uses the **circular footprint approximation** (`sum of effective radii`), consistent with the moving token's footprint model. Contact is clamped at the first intersection along the route, with a small skin so touching is allowed but overlap is not.

**Why:** exact token shapes (`token.shape`) can be polygons with holes; solving continuous first-contact against arbitrary polygons is disproportionate for a drag preview. The circular approximation is conservative for the usual square/circle 5e footprints and is what makes the cursor-relative perimeter rotation formula exact. It is documented as an approximation.

## 6. Rotation versus ordinary movement

**Decision:** confirmed. Rotation mode requires all of:

1. the moving token's current constrained position is touching the candidate enemy (within a small tolerance), and
2. the cursor is inside that enemy's footprint, and
3. the interaction is part of the same drag.

Every proposed perimeter position is validated against blocking walls and every other enemy. The live direction is the signed shorter angular delta from the current angle to the cursor. The committed route is a single arc from the angle at which rotation began to the current perimeter position, using the same shorter delta, so dragging the cursor across the enemy or back and forth cannot record the long way around. If the direct angular step is blocked, the module walks the arc in small steps and clamps at the last legal point instead of jumping through an obstacle. When the cursor leaves the enemy's footprint, rotation ends at the preserved perimeter position and ordinary pathfinding resumes from there. If the cursor sits exactly on the enemy center, the last valid angle is kept.

## Additional limits in 1.0.0

- **Single-token dragging only.** Multi-token drags are skipped (no constraint applied) and logged in debug mode. The module does not silently half-apply to one of several selected tokens.
- **Directional walls** (`dir`) are treated as fully blocking in both directions. One-way movement is not modeled.
- **Terrain walls** and other movement-restriction levels are treated as blocking when `move` is not `None`; open doors are ignored, closed/locked doors block.
- **Overhead tiles, regions, and elevations** are not considered; movement is 2D.
- **Dynamic obstacles** besides tokens (for example vehicles or actively animated hazards) are not modeled.
- **Foundry core pathfinding**: v13 introduced token movement constraints and clone-based dragging. The module replaces the waypoint list in `_prepareDragLeftDropUpdates` rather than correcting the token after placement, so the committed movement is the previewed route. The commit also asks Foundry to skip its own wall pass (`constrainOptions.ignoreWalls`), because that pass uses the full token footprint and would trim a route at a squeeze opening the planner has already validated. Bounds, cost, and dnd5e token blocking still run. If a future core version changes these methods, the compatibility check disables the module with a notification rather than allowing illegal movement.
- **Movement Limiter integration is read-only.** It depends on the module's public `status(token)` contract returning scene-unit `remaining`. If that API changes or is unavailable, Knkr Pathing leaves the route unclamped rather than reading private movement state.
- **Core movement cost**: Foundry measures the committed route by distance. The module reports that distance and, when Movement Limiter is active, truncates the route before committing waypoints.
- **Tag exceptions are runtime registrations.** They are not persisted in the world; a module or macro must register them on each load.
