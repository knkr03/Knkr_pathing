# Testing

> **AI notice:** This file was created with AI assistance. See [NOTICE.md](../NOTICE.md).

## Local test install

`npm run build` packages `dist/knkr-pathing-v<version>.zip`. For a live test,
copy the `knkr-pathing/` folder from the zip (or the repository root) into
`<Foundry Data>/modules/knkr-pathing`, enable **Knkr Pathing** under *Manage
Modules*, and reload the world. The folder name must match the manifest `id`.

On this machine:

```bash
npm run build
npm run install:local -- "D:/VTT_Assets/Data/modules"
```

## Automated tests

```bash
npm test
npm run validate
```

`npm test` runs `node:test` suites in `tests/` against the pure engine. These cover:

- vector/geometry primitives, segment-segment distance, intersections, sampling, first-circle contact;
- wall blocking rules (movement restriction, open/closed/locked doors, walls without movement restrictions);
- direct paths, routing around a single corner, routing through normal-width openings, multiple obstacles, unreachable goals, partial routes, smoothing, and waypoint pruning;
- size-derived body clearance from actual token pixel dimensions, including non-square tokens;
- configurable gap clearance: the 0.75 default, per-size overrides, invalid-value fallback, and the distinct body/passage radii;
- tag-based passage exceptions, unknown tags, narrowest-tag precedence, and factor clamping;
- 75% gaps: a gap at exactly 75% of the token width passes at six different approach angles, while a gap just under it is rejected;
- a 4 ft doorway with jamb returns passes a 5 ft token at both 75% and 25%, and a wall meeting a doorway at its corner does not close the opening;
- reduced gap radius does not reduce ordinary wall clearance;
- sealed rooms and too-narrow openings advance the token toward the cursor until full body clearance stops it, commit that partial move, and render its stopping point with the normal endpoint marker;
- a clamped drag-context destination does not override the raw cursor goal; preview rendering failures leave the drag session alive;
- per-segment distance accounting, no-limit behavior, and external movement budgets truncating the route by scene distance;
- contact inside a movement budget taking precedence, and contact beyond the budget being discarded;
- movement-limiter compatibility, including a rerouted path around a wall that must still stop at the remaining budget, a rotation route limited from the drag origin, and committed waypoints no longer than the budget;
- enemy contact clamping (including "do not stop at an enemy you already touch"), and cursor-relative rotation with wall/other-enemy clamping, zero-length cursor vectors, leaving the enemy footprint, and committing the shorter arc after the cursor crosses the enemy.

`npm run validate` checks manifest/package version agreement, required manifest fields, referenced files, release packaging layout, and the AI notice in every tracked text file.

## Manual Foundry matrix (required before release)

These cannot be automated in this repository. Record Foundry build, dnd5e version, browser, and result for each.

### Setup

- Foundry v13 (latest stable) and v14 (latest stable), dnd5e system enabled.
- One gridless scene with: an open room, a single wall corner, a 5 ft doorway, a 4 ft doorway with short jamb returns, a 3.75 ft gap, a 2.5 ft gap, a 1 ft gap, two hostile tokens (one adjacent to the gap), one friendly token, one neutral token, one hidden hostile token, one open door, one closed door, one one-way wall.
- Tokens: medium PC (1×1), large creature (2×2), small creature (0.5×0.5), and a token whose `getSize()` differs from `width × grid.size` (for example a scene with non-uniform grid scaling). Set the actor sizes so the per-size override can be tested independently of token dimensions.
- D&D 5e Movement Limiter & Undo installed and enabled for the compatibility rows.

### Acceptance checks (mapped to design §14)

| # | Scenario | Expected |
| --- | --- | --- |
| 1 | Drag in open space | Straight preview; token lands at cursor. |
| 2 | Drag across a single wall corner | Preview bends around the corner; token never crosses the wall. |
| 3 | Drag a medium token through a 5 ft doorway from several approach angles | Route passes through the opening and bends toward the cursor; token lands at the cursor. |
| 4 | Drag beyond a 2.5 ft gap with a medium token | No route through the gap; preview stops at the last legal point; destination marked blocked. |
| 5 | Drag a small token (0.5×0.5) through the 2.5 ft gap | Route passes through; token lands at the cursor. |
| 6 | Drag a large token (2×2) through the 5 ft doorway | Route does not fit (5 ft is 50% of the 10 ft token); preview stops before the doorway and marks the destination blocked. |
| 7 | Register `api.registerPassageException("test-tag", 0.5)` and tag a medium token `test-tag` in its module flags | That token now uses the 2.5 ft gap; an untagged token still does not. |
| 8 | Drag a medium token through a 3.75 ft (75% width) gap from several angles | Route passes; token lands at the cursor. A 3.7 ft gap is rejected. |
| 9 | Set Medium gap clearance to 0.5 and drag the medium token through a 2.5 ft gap | Route passes. A token whose actor size is Small and has no override still needs 75%. |
| 10 | Drag past an ordinary wall while the gap default is 0.5 | The token keeps full body clearance against the wall; only measured openings use the reduced radius. |
| 11 | Drag toward a 1 ft gap | Route stops; destination marked unreachable. |
| 12 | Drag into a hostile token | Preview and token stop at the hostile's boundary, not through it. |
| 13 | Drop while overlapping a hostile (force overlap by dragging fast) | Token must not finish overlapping; verify no path leads to overlap. |
| 14 | While touching a hostile, drag cursor over its body and around, including across the far side | Token orbits the hostile, staying on its perimeter, and the committed route takes the shorter arc rather than doubling back. |
| 15 | Orbit toward a wall or second hostile | Token clamps at the last legal perimeter point; never crosses wall/enemy. |
| 16 | Move cursor off the hostile | Rotation ends; ordinary path resumes from the perimeter point without a jump. |
| 17 | Without Movement Limiter, use an actor with low movement and drag a long route | Route reaches the cursor; the label reports distance. Standalone behavior is unchanged. |
| 18 | Temporarily rename `_updateDragDestination` in the console before enabling | Module shows a clear incompatibility warning and does not constrain; no illegal movement is silently allowed. |
| 19 | Switch to a gridded scene and drag | No pathfinding, no overlay; normal Foundry behavior. |
| 20 | Two tokens selected, drag | Module skips (debug log); no partial constraint on one token. |
| 21 | Open vs closed door | Open door passable; closed/locked door blocks. |
| 22 | Toggle the module off mid-drag | Preview disappears, token can be placed normally. |
| 23 | Scene change during drag / canvas teardown | Overlay removed; no orphaned graphics; next drag works. |
| 24 | Wall created/deleted/updated during scene | Next drag uses the new geometry (cache invalidation). |
| 25 | Cone of 50+ walls near a route | Dragging remains responsive (target: no more than ~16 ms of planning per move on a mid-range machine). |
| 26 | With Movement Limiter active, drag farther than the remaining movement on a clear route | Preview turns amber, route stops exactly at the remaining scene distance, and the committed move costs no more than that. |
| 27 | With Movement Limiter active, drag beyond a wall so pathfinding reroutes | Rerouted preview and committed waypoints still stop at the remaining budget; the token does not use the straight-line clamp distance or exceed its turn movement. |
| 28 | With Movement Limiter active, drag into a hostile inside the remaining budget and another hostile beyond it | Contact stops before the first hostile; the budget does not turn an unreached contact into a contact state. |
| 29 | Disable Movement Limiter mid-session and drag | Knkr Pathing stops applying a budget; no stale limit remains from the previous drag. |
| 30 | In combat, drag a token through a wall detour while the Movement Limiter budget is partly spent | The preview token follows the planned route rather than the raw cursor, with no visible flicker between the two positions. |
| 31 | Set Medium gap clearance to 0.25 and drag a 5 ft token through the 4 ft jambed doorway | Preview and committed token both pass through and finish on the far side. Foundry does not trim the route at the doorway. |
| 32 | Drop a squeezed route and inspect `token.movement` / the final position | The committed movement uses the planned route; the final center matches the preview endpoint. |
| 33 | In combat, keep the pointer beyond the remaining budget so Movement Limiter clamps its destination | The planned goal still comes from the cursor; the route stops at the budget rather than at the clamped straight-line point. |

### Console checks

- No uncaught errors on load with the module enabled in a gridded scene.
- No repeated warnings from the compatibility layer when everything is present.
- `game.modules.get('knkr-pathing').api` exposes `plan`, `version`, and `diagnostics()` for debugging.

## Reporting

Add a `## Verified` section to the release entry in `CHANGELOG.md` listing Foundry build and dnd5e version for each pass. Do not raise `compatibility.verified` until the matrix passes on that major version.
