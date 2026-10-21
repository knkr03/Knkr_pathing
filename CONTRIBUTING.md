# Contributing

> **AI notice:** This file was created with AI assistance. See [NOTICE.md](../NOTICE.md).

## Ground rules

- Keep the AI attribution notice in every file and in `NOTICE.md`.
- The `src/core/` directory must stay free of Foundry globals so it remains unit-testable under plain Node.
- Add or update tests for any behavior change in the geometry, pathfinding, squeeze, cost, or enemy code.
- Do not weaken assertions or add ignore directives to make a check pass; fix the behavior.

## Local workflow

```bash
npm test
npm run validate
npm run build
```

`npm run build` writes `dist/knkr-pathing/` and `dist/knkr-pathing-v<version>.zip`. The zip contains the module folder at its root, which is what Foundry expects.

## Release process

1. Update `CHANGELOG.md` and bump the version in **both** `package.json` and `module.json` (the validator enforces equality). The stamped `download` URL must reference the new tag.
2. Run `npm run check && npm run build`.
3. Commit, tag `v<version>`, and push the tag.
4. The `Release` GitHub workflow rebuilds the zip, verifies it, and attaches `module.json` and the zip to a GitHub release. Foundry's automatic update check consumes that `module.json`.

## Manual Foundry checks

Automated tests cannot cover token dragging. Every release candidate needs the matrix in [testing.md](testing.md), and the tested Foundry versions must be recorded in the changelog and the manifest's `compatibility.verified` field.
