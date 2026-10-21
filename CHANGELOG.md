# Changelog

> **AI notice:** This file was created with AI assistance. See [NOTICE.md](../NOTICE.md).

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

- Live Foundry v13/v14 validation of the drag lifecycle, canvas overlay, and movement-budget synchronization.

## [0.1.0] - 2026-10-21

### Added

- Foundry v13/v14 module manifest, styles, localization, and settings.
- Gridless scene detection and safe disable when the scene uses a grid.
- Circle-footprint token model derived from document dimensions and texture scale.
- Blocking-wall extraction with open-door handling and a wall-geometry cache.
- Visibility-graph A* pathfinder with direct-path fast path, waypoint pruning, smoothing, and best-effort partial routes.
- Squeeze-only gap detection, squeeze markers, and drag-to-marker activation.
- Per-segment movement costs with the squeeze multiplier and budget clamping.
- Hostile-token contact clamping and cursor-relative rotation around an enemy.
- Canvas path preview with normal, squeeze, blocked, contact, and budget states.
- Unit tests for every pure engine, manifest validation, AI-notice coverage, and release packaging scripts.
