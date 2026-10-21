# Design Decisions

> **AI notice:** This file was created with AI assistance. See [NOTICE.md](../NOTICE.md).

This document resolves §15 of the supplied design specification and records the deliberate limits of the 0.1.0 implementation. Each decision lists what is implemented, why, and what would be needed to change it.

## 1. Squeezing geometry

**Decision:** A creature's squeeze footprint is **one D&D 5e size category smaller**, modeled as a circle whose radius is `normalRadius × squeezeFactor`, with `squeezeFactor` defaulting to **0.5**.

**Why:** 5e's Squeezing rule lets a creature move through a space wide enough for a creature one size smaller (a Medium creature uses a 2.5 ft space instead of 5 ft). In a gridless circular-footprint model, halving the diameter is the direct analogue. The footprint is not the token's rendered art; it is the displayed occupied space (document width/height × texture scale).

**Configuration:** the factor is a world setting, so a DM can make squeezing stricter (for example `0.75`) or more permissive (`0.4`) without code changes. The squeeze radius is never larger than the normal radius. The multiplier is separately configurable.

**Limit:** non-circular token footprints are approximated by a conservative circumscribed circle. Exact polygon/ellipse squeezing is out of scope for 0.1.0.

## 2. Marker dimensions

**Decision:** the squeeze marker is **1.5 scene feet in diameter** by default (≈30 px at the default 5 ft / 100 px scale), configurable in feet as `markerDiameterFeet`. The activation area is the marker circle plus a small padding (`markerActivationPaddingFeet`, default 0.25 ft).

**Why:** §15 of the design fixes 1.5 ft; the earlier §6.1 text mentions 5 ft, which is large enough to overlap tokens and walls. 1.5 ft is visible at normal zoom and clearly an interaction target, and the padding makes it forgiving to hit without requiring pixel precision. Marker size is stored in scene units and converted to pixels using scene scale, so it is consistent across scenes.

## 3. Marker activation

**Decision:**

- Markers are produced only when the committed route to the cursor **requires squeezing** — that is, the normal-footprint route is impossible but the squeeze-footprint route exists. A normal route always wins, so markers never appear as shortcuts while ordinary movement is possible.
- Dragging the token (its constrained center) into a marker's activation area commits to squeezing for that route.
- Squeezing is cancelled automatically when a normal route to the current cursor becomes possible again (for example, the user backs out of the gap before entering it).
- Once the token is inside a region that needs the smaller footprint, a normal route cannot exist from that position, so the state persists naturally. Adjacent squeeze passages keep the state active because the token never returns to normal clearance.
- If the cursor leaves the marker before the token enters, the token remains on the last normally reachable point, so nothing illegal happens.

## 4. Movement accounting

**Decision:** the module computes its **own per-segment cost** and clamps the preview/destination with it. It reads Foundry's native movement record for already-spent movement, but it does **not** rewrite Foundry's movement history or the core ruler.

- Remaining budget = system speed for the active movement action − native spent movement − module-recorded extra squeeze cost.
- Budget clamping is **combat-scoped**. Outside combat the preview still reports distance and cost, but the token is not clamped to a speed. This prevents exploration dragging from becoming stuck due to a turn resource that has no turn boundary outside combat.
- Native spent movement comes from `TokenDocument#movementHistory` (v13+) when entries expose `cost` and `action`.
- Extra squeeze cost (the difference between doubled and physical distance) is recorded by the module per token, per combat turn, and cleared when the turn changes, when combat ends, or when a drag starts with an empty native movement history.
- If no usable speed/history data exists (non-dnd5e system, unlinked actor without movement data, or a version where the shapes differ), budget enforcement is skipped and the preview reports physical distance and computed cost only.

**Why:** patching core movement history would risk corrupting the ruler and other modules. The design requires tracking physical length and movement cost separately; the module does that explicitly in its path segments and surfaces both.

**Known limit:** the native ruler shows physical distance, while the module's label shows the adjusted cost. Integrating the multiplier into core's recorded movement needs a supported core API; until then this is a documented divergence. Budget clamping during enemy-perimeter rotation uses the current plan cost rather than accumulated orbital arc length, so it is approximate in that one interaction. Scene units are assumed to match the system's movement units (5 ft per grid unit by default); a scene measured in meters is not converted.

## 5. Enemy classification

**Decision:** an enemy is selected by disposition, relative to the moving token's disposition, with a configurable policy:

| Setting | Included tokens |
| --- | --- |
| `hostile` (default) | Hostile tokens only. |
| `hostile-neutral` | Hostile and neutral tokens. |
| `non-friendly` | Every token whose disposition is not Friendly. |

Hidden tokens are excluded by default and can be included by setting. Defeated/incapacitated tokens are **not** automatically excluded: the disposition is the contract. Secret tokens are treated as hidden. A token never collides with itself. Friendly tokens are never obstacles under any policy. The moving token's own disposition is not otherwise interpreted (a hostile creature dragged by the GM still treats hostile tokens as enemies, which matches "hostile relative to the moving token" via the shared hostile disposition).

**Why:** conservative defaults avoid surprising friendly-fire collisions, and the policy setting resolves the neutral/unlinked case explicitly rather than guessing from actor types.

## 6. Enemy contact geometry

**Decision:** enemy contact uses the **circular footprint approximation** (`sum of effective radii`), consistent with the moving token's footprint model. Contact is clamped at the first intersection along the route, with a small skin so touching is allowed but overlap is not.

**Why:** exact token shapes (`token.shape`) can be polygons with holes; solving continuous first-contact against arbitrary polygons is disproportionate for a drag preview. The circular approximation is conservative for the usual square/circle 5e footprints and is what makes the cursor-relative perimeter rotation formula exact. It is documented as an approximation.

## 7. Rotation versus ordinary movement

**Decision:** confirmed. Rotation mode requires all of:

1. the moving token's current constrained position is touching the candidate enemy (within a small tolerance), and
2. the cursor is inside that enemy's footprint, and
3. the interaction is part of the same drag.

Every proposed perimeter position is validated against blocking walls, every other enemy, and the movement budget. If the direct angular step is blocked, the module walks the arc from the last valid angle toward the requested angle and clamps at the last legal point instead of jumping through an obstacle. When the cursor leaves the enemy's footprint, rotation ends at the preserved perimeter position and ordinary pathfinding resumes from there. If the cursor sits exactly on the enemy center, the last valid angle is kept.

## Additional limits in 0.1.0

- **Single-token dragging only.** Multi-token drags are skipped (no constraint applied) and logged in debug mode. The module does not silently half-apply to one of several selected tokens.
- **Directional walls** (`dir`) are treated as fully blocking in both directions. One-way movement is not modeled.
- **Terrain walls** and other movement-restriction levels are treated as blocking when `move` is not `None`; open doors are ignored, closed/locked doors block.
- **Overhead tiles, regions, and elevations** are not considered; movement is 2D.
- **Dynamic obstacles** besides tokens (for example vehicles or actively animated hazards) are not modeled.
- **Foundry core pathfinding**: v13 introduced token movement constraints. The module applies its own constraint after the core drag handler; if a future core version changes the drag pipeline, the compatibility check disables the module with a notification rather than allowing illegal movement.
