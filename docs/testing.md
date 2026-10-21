# Testing

> **AI notice:** This file was created with AI assistance. See [NOTICE.md](../NOTICE.md).

## Automated tests

```bash
npm test
npm run validate
```

`npm test` runs `node:test` suites in `tests/` against the pure engine. These cover:

- vector/geometry primitives, segment-segment distance, intersections, sampling, first-circle contact;
- wall blocking rules (movement restriction, open/closed/locked doors, walls without movement restrictions);
- direct paths, routing around a single corner, routing through normal-width openings, multiple obstacles, unreachable goals, partial routes, smoothing, and waypoint pruning;
- normal vs squeeze-only vs impassable classification at different token sizes;
- squeeze run detection, marker placement, duplicate suppression, and backoff;
- per-segment cost accounting for mixed routes, the ×2 multiplier, and budget clamping;
- enemy contact clamping (including "do not stop at an enemy you already touch"), and cursor-relative rotation with wall/other-enemy clamping, zero-length cursor vectors, and leaving the enemy footprint.

`npm run validate` checks manifest/package version agreement, required manifest fields, referenced files, release packaging layout, and the AI notice in every tracked text file.

## Manual Foundry matrix (required before release)

These cannot be automated in this repository. Record Foundry build, dnd5e version, browser, and result for each.

### Setup

- Foundry v13 (latest stable) and v14 (latest stable), dnd5e system enabled.
- One gridless scene with: an open room, a single wall corner, a 5 ft doorway, a 2.5 ft gap, a 1 ft gap, two hostile tokens (one adjacent to the gap), one friendly token, one neutral token, one hidden hostile token, one open door, one closed door, one one-way wall.
- Tokens: medium PC (1×1), large creature (2×2), small creature (0.5×0.5), token with texture scale 1.2.

### Acceptance checks (mapped to design §14)

| # | Scenario | Expected |
| --- | --- | --- |
| 1 | Drag in open space | Straight preview; token lands at cursor. |
| 2 | Drag across a single wall corner | Preview bends around the corner; token never crosses the wall. |
| 3 | Drag through normal doorway | Straight/angled route through the opening; no squeeze marker. |
| 4 | Drag beyond a 2.5 ft gap with a medium token | Normal route missing; orange marker appears at the gap entrance; token stops before the gap. |
| 5 | Drag token onto the marker | Squeeze route appears; token enters the gap. |
| 6 | Complete the drag through the gap | Label reports physical distance and doubled cost for the gap section only; native ruler may differ (documented). |
| 7 | Continue past the gap | Preview returns to normal styling and ×1 cost after clearance. |
| 8 | Drag toward a 1 ft gap | No marker; route stops; destination marked unreachable. |
| 9 | Drag into a hostile token | Preview and token stop at the hostile's boundary, not through it. |
| 10 | Drop while overlapping a hostile (force overlap by dragging fast) | Token must not finish overlapping; verify no path leads to overlap. |
| 11 | While touching a hostile, drag cursor over its body and around | Token orbits the hostile, staying on its perimeter, following cursor angle. |
| 12 | Orbit toward a wall or second hostile | Token clamps at the last legal perimeter point; never crosses wall/enemy. |
| 13 | Move cursor off the hostile | Rotation ends; ordinary path resumes from the perimeter point without a jump. |
| 14 | Set a low remaining movement (or use a slowed actor), drag a long route | Preview and token stop at the last affordable point, including doubled squeeze cost. |
| 15 | Temporarily rename `_onDragLeftMove` in the console before enabling | Module shows a clear incompatibility warning and does not constrain; no illegal movement is silently allowed. |
| 16 | Switch to a gridded scene and drag | No pathfinding, no markers, no overlay; normal Foundry behavior. |
| 17 | Two tokens selected, drag | Module skips (debug log); no partial constraint on one token. |
| 18 | Open vs closed door | Open door passable; closed/locked door blocks. |
| 19 | Toggle the module off mid-drag | Preview disappears, token can be placed normally. |
| 20 | Scene change during drag / canvas teardown | Overlay removed; no orphaned graphics; next drag works. |
| 21 | Wall created/deleted/updated during scene | Next drag uses the new geometry (cache invalidation). |
| 22 | Cone of 50+ walls near a route | Dragging remains responsive (target: no more than ~16 ms of planning per move on a mid-range machine). |

### Console checks

- No uncaught errors on load with the module enabled in a gridded scene.
- No repeated warnings from the compatibility layer when everything is present.
- `game.modules.get('knkr-pathing').api` exposes `plan`, `version`, and `diagnostics()` for debugging.

## Reporting

Add a `## Verified` section to the release entry in `CHANGELOG.md` listing Foundry build and dnd5e version for each pass. Do not raise `compatibility.verified` until the matrix passes on that major version.
