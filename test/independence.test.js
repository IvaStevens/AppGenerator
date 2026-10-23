// Makes AC4 ("no shared state between two generated apps") observable.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync, execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(__dirname, "..");
const BIN = path.join(REPO_ROOT, "bin", "appgenerator.js");
const FAKE_NPM = path.join(__dirname, "fixtures", "fake-npm.js");

function listAllFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) out.push(...listAllFiles(p));
    else out.push(p);
  }
  return out;
}

function findSymlinks(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isSymbolicLink()) {
      out.push(p);
      continue;
    }
    if (entry.isDirectory()) out.push(...findSymlinks(p));
  }
  return out;
}

test("generating two apps in one session: no cross-references, no escaping symlinks, repo untouched", (t) => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "appgen-independence-"));
  t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));

  // Compare before/after rather than asserting outright emptiness, so this
  // test is meaningful regardless of whatever uncommitted work-in-progress
  // already exists in the repo: generating apps must add zero additional
  // changes on top of that baseline.
  const statusBefore = execSync("git status --porcelain", { cwd: REPO_ROOT, encoding: "utf8" });

  const env = { ...process.env, APPGEN_NPM_BIN: FAKE_NPM, FAKE_NPM_MODE: "success" };

  const r1 = spawnSync(process.execPath, [BIN, "app-alpha"], { cwd, env, encoding: "utf8" });
  assert.equal(r1.status, 0, r1.stderr);
  const r2 = spawnSync(process.execPath, [BIN, "app-beta"], { cwd, env, encoding: "utf8" });
  assert.equal(r2.status, 0, r2.stderr);

  const appAlpha = path.join(cwd, "app-alpha");
  const appBeta = path.join(cwd, "app-beta");

  // Neither app's files mention the other's name.
  for (const f of listAllFiles(appAlpha)) {
    if (f.includes(`${path.sep}node_modules${path.sep}`)) continue;
    const content = fs.readFileSync(f, "utf8");
    assert.ok(!content.includes("app-beta"), `${f} mentions app-beta`);
  }
  for (const f of listAllFiles(appBeta)) {
    if (f.includes(`${path.sep}node_modules${path.sep}`)) continue;
    const content = fs.readFileSync(f, "utf8");
    assert.ok(!content.includes("app-alpha"), `${f} mentions app-alpha`);
  }

  // No symlink in either app escapes that app's own directory.
  for (const [app, root] of [["alpha", appAlpha], ["beta", appBeta]]) {
    for (const link of findSymlinks(root)) {
      const resolved = fs.realpathSync(link);
      const rel = path.relative(root, resolved);
      assert.ok(
        !rel.startsWith("..") && !path.isAbsolute(rel),
        `symlink ${link} (app ${app}) escapes to ${resolved}`,
      );
    }
  }

  // Each app owns its own node_modules - neither is a symlink to the other
  // or to the generator.
  const alphaNm = fs.lstatSync(path.join(appAlpha, "node_modules"));
  const betaNm = fs.lstatSync(path.join(appBeta, "node_modules"));
  assert.ok(!alphaNm.isSymbolicLink());
  assert.ok(!betaNm.isSymbolicLink());

  // Generating into os.tmpdir() must never touch the AppGenerator repo.
  const statusAfter = execSync("git status --porcelain", { cwd: REPO_ROOT, encoding: "utf8" });
  assert.equal(statusAfter, statusBefore);
});

test("generating two react-native-android apps in one session: no cross-references, no escaping symlinks, repo untouched", (t) => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "appgen-independence-rn-"));
  t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));

  const statusBefore = execSync("git status --porcelain", { cwd: REPO_ROOT, encoding: "utf8" });

  const env = { ...process.env, APPGEN_NPM_BIN: FAKE_NPM, FAKE_NPM_MODE: "success" };

  const r1 = spawnSync(
    process.execPath,
    [BIN, "rn-app-alpha", "--target", "react-native-android"],
    { cwd, env, encoding: "utf8" },
  );
  assert.equal(r1.status, 0, r1.stderr);
  const r2 = spawnSync(
    process.execPath,
    [BIN, "rn-app-beta", "--target", "react-native-android"],
    { cwd, env, encoding: "utf8" },
  );
  assert.equal(r2.status, 0, r2.stderr);

  const appAlpha = path.join(cwd, "rn-app-alpha");
  const appBeta = path.join(cwd, "rn-app-beta");

  // Neither app's files mention the other's name (text files only - the
  // tree contains a jar, a keystore, and PNGs that are not valid utf8).
  const TEXT_FILE_RE = /\.(json|js|jsx|ts|tsx|md|gradle|properties|xml|pro|txt)$/;
  function isLikelyTextFile(f) {
    return TEXT_FILE_RE.test(f) || path.basename(f) === "gradlew" || path.basename(f).startsWith(".");
  }
  for (const f of listAllFiles(appAlpha)) {
    if (f.includes(`${path.sep}node_modules${path.sep}`)) continue;
    if (!isLikelyTextFile(f)) continue;
    const content = fs.readFileSync(f, "utf8");
    assert.ok(!content.includes("rn-app-beta"), `${f} mentions rn-app-beta`);
  }
  for (const f of listAllFiles(appBeta)) {
    if (f.includes(`${path.sep}node_modules${path.sep}`)) continue;
    if (!isLikelyTextFile(f)) continue;
    const content = fs.readFileSync(f, "utf8");
    assert.ok(!content.includes("rn-app-alpha"), `${f} mentions rn-app-alpha`);
  }

  // No symlink in either app escapes that app's own directory.
  for (const [app, root] of [["alpha", appAlpha], ["beta", appBeta]]) {
    for (const link of findSymlinks(root)) {
      const resolved = fs.realpathSync(link);
      const rel = path.relative(root, resolved);
      assert.ok(
        !rel.startsWith("..") && !path.isAbsolute(rel),
        `symlink ${link} (app ${app}) escapes to ${resolved}`,
      );
    }
  }

  // Each app owns its own node_modules - neither is a symlink to the
  // other or to the generator.
  const alphaNm = fs.lstatSync(path.join(appAlpha, "node_modules"));
  const betaNm = fs.lstatSync(path.join(appBeta, "node_modules"));
  assert.ok(!alphaNm.isSymbolicLink());
  assert.ok(!betaNm.isSymbolicLink());

  // Two different names get two different applicationIds.
  const buildGradleA = fs.readFileSync(path.join(appAlpha, "android/app/build.gradle"), "utf8");
  const buildGradleB = fs.readFileSync(path.join(appBeta, "android/app/build.gradle"), "utf8");
  const idA = buildGradleA.match(/applicationId "([^"]*)"/)[1];
  const idB = buildGradleB.match(/applicationId "([^"]*)"/)[1];
  assert.notEqual(idA, idB);

  // Generating into os.tmpdir() must never touch the AppGenerator repo.
  const statusAfter = execSync("git status --porcelain", { cwd: REPO_ROOT, encoding: "utf8" });
  assert.equal(statusAfter, statusBefore);
});
