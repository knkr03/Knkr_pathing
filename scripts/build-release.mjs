// AI notice: created with AI assistance (Freebuff / Codebuff). See NOTICE.md.
import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { writeZip } from "./zip.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const DIST = path.join(ROOT, "dist");
const MODULE_ID = "knkr-pathing";
const pkg = JSON.parse(await readFile(path.join(ROOT, "package.json"), "utf8"));
const manifest = JSON.parse(await readFile(path.join(ROOT, "module.json"), "utf8"));

if (manifest.version !== pkg.version) {
  console.error(`Refusing to build: module.json ${manifest.version} != package.json ${pkg.version}`);
  process.exit(1);
}

const releaseTag = `v${pkg.version}`;
const baseUrl = manifest.url?.replace(/\/$/, "") ?? "https://github.com/knkr03/Knkr_pathing";
const stamped = {
  ...manifest,
  version: pkg.version,
  manifest: `${baseUrl}/releases/latest/download/module.json`,
  download: `${baseUrl}/releases/download/${releaseTag}/${MODULE_ID}-${releaseTag}.zip`
};

const staging = path.join(DIST, MODULE_ID);
await rm(DIST, { recursive: true, force: true });
await mkdir(staging, { recursive: true });

const include = ["module.json", "README.md", "LICENSE", "NOTICE.md", "CHANGELOG.md", "src", "styles", "lang"];
for (const item of include) {
  await cp(path.join(ROOT, item), path.join(staging, item), { recursive: true });
}
await writeFile(path.join(staging, "module.json"), `${JSON.stringify(stamped, null, 2)}\n`);
await writeFile(path.join(DIST, "module.json"), `${JSON.stringify(stamped, null, 2)}\n`);

async function collect(directory, prefix = "") {
  const entries = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) entries.push(...(await collect(absolute, relative)));
    else entries.push({ name: `${MODULE_ID}/${relative}`, path: absolute });
  }
  return entries;
}

const zipPath = path.join(DIST, `${MODULE_ID}-${releaseTag}.zip`);
const files = await collect(staging);
await writeZip(files, zipPath);

console.log(`Built ${path.relative(ROOT, staging)}/ (${files.length} files)`);
console.log(`Built ${path.relative(ROOT, zipPath)}`);
