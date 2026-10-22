// AI notice: created with AI assistance (Freebuff / Codebuff). See NOTICE.md.

/**
 * Copy the built module into a Foundry data directory for local testing.
 *
 * Usage:
 *   npm run build
 *   npm run install:local -- "D:/VTT_Assets/Data/modules"
 *
 * The target is the Foundry Data `modules` directory, not the module folder
 * itself. The folder name is taken from the manifest id so it always matches.
 */

import { cp, mkdir, readFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const targetRoot = process.argv[2] ?? process.env.FOUNDRY_MODULES;
if (!targetRoot) {
  console.error("Usage: npm run install:local -- <path to Foundry Data/modules>");
  process.exit(1);
}

const source = path.resolve("dist/knkr-pathing");
const manifestPath = path.join(source, "module.json");
if (!existsSync(manifestPath)) {
  console.error("Build output is missing. Run `npm run build` first.");
  process.exit(1);
}

const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
if (!manifest.id) {
  console.error("The built manifest has no id.");
  process.exit(1);
}

const destination = path.join(targetRoot, manifest.id);
// Replace the module folder so files removed from the build (for example a
// deleted core module) do not linger in the installed copy and get loaded by
// Foundry. The target is derived from the manifest id, so this only touches
// this module's own directory.
await rm(destination, { recursive: true, force: true });
await mkdir(destination, { recursive: true });
await cp(source, destination, { recursive: true, force: true });
console.log(`Installed ${manifest.id} ${manifest.version} to ${destination}`);
