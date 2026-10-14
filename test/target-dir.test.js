import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { acquireTargetDir } from "../src/target-dir.js";

function mkTmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "appgen-targetdir-"));
}

test("non-existent path is created, createdByUs true, empty snapshot", (t) => {
  const cwd = mkTmp();
  t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));

  const result = acquireTargetDir("newapp", { cwd });
  assert.equal(result.target, path.join(cwd, "newapp"));
  assert.equal(result.createdByUs, true);
  assert.equal(result.snapshot.size, 0);
  assert.ok(fs.statSync(result.target).isDirectory());
});

test("completely empty pre-existing directory is accepted, createdByUs false", (t) => {
  const cwd = mkTmp();
  t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
  fs.mkdirSync(path.join(cwd, "app"));

  const result = acquireTargetDir("app", { cwd });
  assert.equal(result.createdByUs, false);
  assert.equal(result.snapshot.size, 0);
});

test("directory with only benign dotfiles is accepted with those in the snapshot", (t) => {
  const cwd = mkTmp();
  t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
  const target = path.join(cwd, "app");
  fs.mkdirSync(target);
  fs.mkdirSync(path.join(target, ".git"));
  fs.writeFileSync(path.join(target, ".DS_Store"), "");

  const result = acquireTargetDir("app", { cwd });
  assert.equal(result.createdByUs, false);
  assert.deepEqual([...result.snapshot].sort(), [".DS_Store", ".git"]);
});

test("directory with only a user .gitignore is refused as non-empty (not benign)", (t) => {
  // Regression for a review finding: .gitignore must NOT be in the benign
  // set, because scaffold.js's _gitignore -> .gitignore rename is the only
  // rename it performs, and treating a pre-existing .gitignore as benign
  // would mean silently overwriting the user's file.
  const cwd = mkTmp();
  t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
  const target = path.join(cwd, "app");
  fs.mkdirSync(target);
  fs.writeFileSync(path.join(target, ".gitignore"), "secrets.env\n*.key\n");

  assert.throws(
    () => acquireTargetDir("app", { cwd }),
    (err) => err.exitCode === 3 && err.message.includes(target),
  );
  // Refusal itself must not touch the file.
  assert.equal(
    fs.readFileSync(path.join(target, ".gitignore"), "utf8"),
    "secrets.env\n*.key\n",
  );
});

test("directory with any other entry is refused, naming the path", (t) => {
  const cwd = mkTmp();
  t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
  const target = path.join(cwd, "app");
  fs.mkdirSync(target);
  fs.writeFileSync(path.join(target, "readme.txt"), "hi");

  assert.throws(
    () => acquireTargetDir("app", { cwd }),
    (err) => err.exitCode === 3 && err.message.includes(target),
  );
});

test("target that is a file is refused", (t) => {
  const cwd = mkTmp();
  t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
  fs.writeFileSync(path.join(cwd, "app"), "i am a file");

  assert.throws(
    () => acquireTargetDir("app", { cwd }),
    (err) => err.exitCode === 3,
  );
});

test("target that is a symlink is refused", (t) => {
  const cwd = mkTmp();
  t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
  const real = path.join(cwd, "real-empty-dir");
  fs.mkdirSync(real);
  fs.symlinkSync(real, path.join(cwd, "app"));

  assert.throws(
    () => acquireTargetDir("app", { cwd }),
    (err) => err.exitCode === 3,
  );
});

test("containment assertion rejects a target that escapes cwd", (t) => {
  const cwd = mkTmp();
  t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));

  // validate-app-name.js would normally reject this first; target-dir.js
  // re-asserts containment independently as defence-in-depth.
  assert.throws(
    () => acquireTargetDir("..", { cwd }),
    (err) => err.exitCode === 2 || err.exitCode === 3,
  );
});
