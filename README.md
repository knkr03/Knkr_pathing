# Knkr Pathing

> **AI notice:** This repository and every file in it were created with AI assistance (Freebuff / Codebuff). See [NOTICE.md](NOTICE.md).

A Foundry VTT module for **D&D 5e gridless scenes** that turns token dragging into constrained movement: wall-aware pathfinding, squeeze-only gap detection with an interaction marker, doubled movement cost while squeezing, and hostile-token collision with cursor-relative rotation around an enemy.

Design specification: [docs/design-decisions.md](docs/design-decisions.md) records how the open questions in the supplied spec were resolved. Architecture: [docs/architecture.md](docs/architecture.md).

## Status

`0.1.0` is the initial implementation of the design's Stages 1–6. The geometry, pathfinding, gap classification, cost, and enemy-rotation engines are covered by automated unit tests (`npm test`). The Foundry integration layer targets Foundry **v13** and **v14** and is written defensively, but it has **not yet been exercised inside a live Foundry instance** in this development environment. Treat it as a test candidate, not a verified release: run the matrix in [docs/testing.md](docs/testing.md) before using it in a game.

## Features

- **Gridless-only** operation, with automatic disable when the active scene uses a grid.
- **Wall-aware pathfinding** using an expanded-obstacle visibility graph and A*, with direct-path fast path, waypoint pruning, and path smoothing.
- **Gap classification**: normal passage, squeeze-only passage, impassable passage. Token footprint (size and texture scale) is used, never just the token center.
- **Squeeze markers**: a small circle at the entrance to each squeeze-only passage in the current route. Drag the token onto the marker to commit to squeezing.
- **Two footprint profiles**: normal radius and D&D 5e one-size-smaller squeeze radius (50% by default; configurable).
- **Per-segment movement cost**: `normal distance + squeeze distance × 2`, applied only to the narrow section, with a configurable multiplier and optional movement-budget clamp.
- **Hostile-token collision**: the preview and the token stop at the first contact point along the path.
- **Rotate around an enemy**: while touching an enemy, drag the cursor over that enemy to orbit it; wall and other-enemy collisions are still enforced.
- **Live preview** drawn on the canvas: normal, squeezing, blocked, contact, and budget-exhausted states, with an optional cost label.

## Installation

### From a release (recommended)

1. Download `knkr-pathing-v<version>.zip` from [Releases](https://github.com/knkr03/Knkr_pathing/releases).
2. In Foundry's **Add-on Modules** tab, use **Install Module** and point it at the release manifest URL:
   `https://github.com/knkr03/Knkr_pathing/releases/latest/download/module.json`.
3. Enable **Knkr Pathing** in your world.

The repository owner assumed by the manifests is `knkr03`; if the module lives under a different GitHub account, update `url`, `manifest`, `download`, and the badge/workflow URLs before publishing.

### Manual development install

Keep the checkout folder name identical to the manifest id (`knkr-pathing`) inside `Data/modules/`:

```text
Data/modules/knkr-pathing/
  module.json
  src/
  styles/
  lang/
```

Then launch Foundry with the module enabled in a **gridless** D&D 5e scene.

## Usage

1. Open a gridless scene whose walls have the **Normal** movement restriction (doors work: open doors are ignored, closed and locked doors block).
2. Drag a single token. A path preview appears.
3. If the destination is only reachable through a narrow gap, the token stops before the gap and an orange squeeze marker appears. Drag the token onto the marker to commit; the path and cost update to the squeeze route.
4. Dragging over a hostile token while touching it orbits that token instead of crossing it.

Settings are under **Configure Settings → Module Settings → Knkr Pathing**:

| Setting | Default | Purpose |
| --- | --- | --- |
| Enable pathfinding | on | Master client-side toggle. |
| Squeeze footprint factor | 0.5 | Squeeze radius = normal radius × this value. 0.5 matches 5e "one size smaller". |
| Squeeze cost multiplier | 2 | Cost multiplier applied to squeeze segments. |
| Squeeze marker diameter | 1.5 ft | Display and activation size of the marker. |
| Enemy collision | Hostile only | Which dispositions block movement (hostile, hostile + neutral, all non-friendly). |
| Include hidden enemies | off | Whether hidden hostile tokens block movement. |
| Enforce movement budget | on | During combat, clamp the path to remaining movement when the system exposes a usable budget. Outside combat, costs are shown but movement is not clamped. |
| Show cost label | on | Draw distance/cost text beside the preview. |
| Debug logging | off | Verbose console diagnostics. |

A keybinding (**Knkr Pathing: Toggle pathfinding**) is registered and unbound by default.

## How it works (short version)

- Blocking wall segments are treated as capsules expanded by the moving token's normal or squeeze radius. Clearance between a path and a wall is the minimum segment-to-segment distance.
- A direct start→goal segment is used when clear. Otherwise candidate waypoints are generated around expanded wall endpoints and connected by visibility, then A* finds the shortest valid route.
- Squeezing is detected by planning the same route with the smaller radius: if the normal route fails and the squeeze route succeeds, the narrow clearance runs along the squeeze route become squeeze-only passages.
- Costs are computed per segment from sampled clearance, so the multiplier applies only while the token's footprint actually needs the reduced profile.
- Enemy tokens are not pathfinding obstacles; they are clamp obstacles. The route stops at first contact, which keeps behavior predictable and enables perimeter rotation.

## Development

Requires Node.js 20+.

```bash
npm test          # unit tests (node:test, no dependencies)
npm run validate  # manifest/package consistency and AI notice coverage
npm run build     # builds dist/knkr-pathing/ and the release zip
```

No bundler is used. The module is plain ES modules so it can be loaded directly by Foundry and imported by Node tests. See [CONTRIBUTING.md](CONTRIBUTING.md) for the release process.

## License

MIT. See [LICENSE](LICENSE). All files are AI-generated; see [NOTICE.md](NOTICE.md).
