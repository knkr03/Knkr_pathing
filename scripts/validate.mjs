// AI notice: created with AI assistance (Freebuff / Codebuff). See NOTICE.md.
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const ROOT = path.resolve(import.meta.dirname, "..");
const IGNORED_DIRS = new Set([".git", "dist", "node_modules", ".freebuff"]);
const TEXT_EXTENSIONS = new Set([
  ".md", ".mjs", ".js", ".cjs", ".json", ".yml", ".yaml", ".css", ".txt", ".html", ""
]);
const NOTICE_PATTERN = /ai (notice|assistance|generated|attribution)|created with ai|aiNotice/i;

const failures = [];

function fail(message) {
  failures.push(message);
}

async function readJson(relativePath) {
  try {
    return JSON.parse(await readFile(path.join(ROOT, relativePath), "utf8"));
  } catch (error) {
    fail(`${relativePath}: ${error.message}`);
    return null;
  }
}

async function exists(relativePath) {
  try {
    await stat(path.join(ROOT, relativePath));
    return true;
  } catch {
    return false;
  }
}

async function* walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!IGNORED_DIRS.has(entry.name)) {
        yield* walk(path.join(directory, entry.name));
      }
    } else {
      yield path.join(directory, entry.name);
    }
  }
}

const pkg = await readJson("package.json");
const manifest = await readJson("module.json");

if (pkg && manifest) {
  if (pkg.version !== manifest.version) {
    fail(`version mismatch: package.json ${pkg.version} != module.json ${manifest.version}`);
  }
  for (const field of ["id", "title", "version", "compatibility", "esmodules", "authors"]) {
    if (manifest[field] === undefined) fail(`module.json is missing required field "${field}"`);
  }
  if (manifest.id !== path.basename(ROOT).toLowerCase() && manifest.id !== "knkr-pathing") {
    fail(`module.json id "${manifest.id}" is not the expected knkr-pathing`);
  }
  if (!manifest.download?.includes(`v${manifest.version}.zip`)) {
    fail(`module.json download URL should reference v${manifest.version}.zip`);
  }
  if (!manifest.manifest?.includes("/releases/latest/download/module.json")) {
    fail("module.json manifest URL should point at the latest release module.json");
  }
  if (manifest.compatibility?.minimum !== "13") {
    fail("module.json compatibility.minimum should be 13");
  }

  const referenced = [
    ...(manifest.esmodules ?? []),
    ...(manifest.styles ?? []),
    ...(manifest.languages ?? []).map((language) => language.path)
  ];
  for (const file of referenced) {
    if (!(await exists(file))) fail(`module.json references missing file: ${file}`);
  }

  const source = await readFile(path.join(ROOT, manifest.esmodules?.[0] ?? ""), "utf8").catch(() => "");
  for (const api of ["Hooks.once(\"init\"", "Hooks.once(\"ready\"", "Hooks.on(\"canvasReady\""]) {
    if (!source.includes(api)) fail(`entry module is missing expected bootstrap call ${api}`);
  }
}

let checked = 0;
for await (const file of walk(ROOT)) {
  const relative = path.relative(ROOT, file).split(path.sep).join("/");
  if (TEXT_EXTENSIONS.has(path.extname(file))) {
    const contents = await readFile(file, "utf8");
    if (!NOTICE_PATTERN.test(contents.slice(0, 4000))) {
      fail(`${relative}: missing AI notice in the first 4000 characters`);
    }
    checked += 1;
  }
}

if (failures.length) {
  console.error("Validation failed:\n");
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(1);
}

console.log(`Validation passed: ${checked} text files checked, manifest ${manifest?.version ?? "?"}.`);
