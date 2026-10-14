// Offline guard against the failure mode that breaks every single
// generation: the template's declared dependencies drifting out of sync
// with the committed lockfile. Catches that in milliseconds instead of at
// every user's `npm ci`.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATE_ROOT = path.join(__dirname, "..", "templates", "electron-gluestack");

test("every declared dependency and devDependency is pinned in the committed lockfile at the exact declared version", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(TEMPLATE_ROOT, "package.json"), "utf8"));
  const lock = JSON.parse(fs.readFileSync(path.join(TEMPLATE_ROOT, "package-lock.json"), "utf8"));

  const rootPkg = lock.packages[""];
  assert.ok(rootPkg, "lockfile has no root packages[''] entry");

  const declared = { ...pkg.dependencies, ...pkg.devDependencies };

  for (const [name, version] of Object.entries(declared)) {
    const lockedRange =
      (rootPkg.dependencies && rootPkg.dependencies[name]) ||
      (rootPkg.devDependencies && rootPkg.devDependencies[name]);
    assert.equal(
      lockedRange,
      version,
      `package.json declares ${name}@${version} but the lockfile's root entry says ${lockedRange}`,
    );

    const resolvedEntry = lock.packages[`node_modules/${name}`];
    assert.ok(resolvedEntry, `lockfile has no node_modules/${name} entry`);
    assert.equal(
      resolvedEntry.version,
      version,
      `lockfile resolves ${name} to ${resolvedEntry.version}, expected exactly ${version}`,
    );
  }
});

test("package.json declares exact versions (no ranges) for every direct dependency", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(TEMPLATE_ROOT, "package.json"), "utf8"));
  const declared = { ...pkg.dependencies, ...pkg.devDependencies };
  for (const [name, version] of Object.entries(declared)) {
    assert.ok(
      /^\d+\.\d+\.\d+$/.test(version),
      `${name} is declared as "${version}", which is not an exact pinned version`,
    );
  }
});
