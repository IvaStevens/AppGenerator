import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { satisfiesNodeFloor } from "../src/cli.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BIN = path.join(__dirname, "..", "bin", "appgenerator.js");
const FAKE_NPM = path.join(__dirname, "fixtures", "fake-npm.js");

function mkTmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "appgen-cli-"));
}

function runCli(args, { cwd, env = {} }) {
  return spawnSync(process.execPath, [BIN, ...args], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
}

// --- Node floor helper (unit, no spawn needed) ---------------------------

test("satisfiesNodeFloor: below the floor is rejected", () => {
  assert.equal(satisfiesNodeFloor("v22.11.9"), false);
  assert.equal(satisfiesNodeFloor("v20.19.0"), false);
  assert.equal(satisfiesNodeFloor("18.0.0"), false);
});

test("satisfiesNodeFloor: exactly at the floor is accepted", () => {
  assert.equal(satisfiesNodeFloor("v22.12.0"), true);
});

test("satisfiesNodeFloor: above the floor is accepted", () => {
  assert.equal(satisfiesNodeFloor("v22.20.0"), true);
  assert.equal(satisfiesNodeFloor("v23.0.0"), true);
});

// --- End-to-end CLI behaviour, offline via the fake-npm fixture ----------

test("success: exit 0, no manual steps needed, no leftover node_modules from a missing electron", (t) => {
  const cwd = mkTmp();
  t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));

  const result = runCli(["demoapp"], {
    cwd,
    env: { APPGEN_NPM_BIN: FAKE_NPM, FAKE_NPM_MODE: "success" },
  });

  assert.equal(result.status, 0, result.stderr);
  const target = path.join(cwd, "demoapp");
  assert.ok(fs.existsSync(path.join(target, "package.json")));
  assert.ok(fs.existsSync(path.join(target, "node_modules", "marker.txt")));
});

test("non-empty target is refused with exit 3, stderr names the path, pre-existing file untouched", (t) => {
  const cwd = mkTmp();
  t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
  const target = path.join(cwd, "occupied");
  fs.mkdirSync(target);
  fs.writeFileSync(path.join(target, "keep.txt"), "do not touch");

  const result = runCli(["occupied"], { cwd, env: {} });

  assert.equal(result.status, 3);
  assert.ok(result.stderr.includes(target));
  assert.equal(fs.readFileSync(path.join(target, "keep.txt"), "utf8"), "do not touch");
});

test("invalid name is rejected with exit 2 and zero filesystem writes", (t) => {
  const cwd = mkTmp();
  t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));

  const result = runCli(["../escape"], { cwd, env: {} });

  assert.equal(result.status, 2);
  // Nothing was created anywhere relative to cwd.
  assert.deepEqual(fs.readdirSync(cwd), []);
});

test("npm not found on PATH: exit 5, actionable message, no leftover directory", (t) => {
  const cwd = mkTmp();
  t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));

  const result = runCli(["noapp"], {
    cwd,
    env: { APPGEN_NPM_BIN: "/definitely/not/on/path/npm-does-not-exist" },
  });

  assert.equal(result.status, 5);
  assert.ok(/not found on PATH/i.test(result.stderr));
  assert.ok(!fs.existsSync(path.join(cwd, "noapp")));
});

test("install failure into a NEW directory: exit 5, directory fully removed, retry succeeds", (t) => {
  const cwd = mkTmp();
  t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));

  const failed = runCli(["retryapp"], {
    cwd,
    env: { APPGEN_NPM_BIN: FAKE_NPM, FAKE_NPM_MODE: "fail" },
  });
  assert.equal(failed.status, 5);
  assert.ok(!fs.existsSync(path.join(cwd, "retryapp")));

  const retried = runCli(["retryapp"], {
    cwd,
    env: { APPGEN_NPM_BIN: FAKE_NPM, FAKE_NPM_MODE: "success" },
  });
  assert.equal(retried.status, 0, retried.stderr);
  assert.ok(fs.existsSync(path.join(cwd, "retryapp", "package.json")));
});

test("install failure into a PRE-EXISTING empty directory: left empty (node_modules removed), .git survives, retry succeeds", (t) => {
  const cwd = mkTmp();
  t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
  const target = path.join(cwd, "preexisting");
  fs.mkdirSync(target);
  fs.mkdirSync(path.join(target, ".git"));
  fs.writeFileSync(path.join(target, ".git", "HEAD"), "ref: refs/heads/main\n");

  const failed = runCli(["preexisting"], {
    cwd,
    env: { APPGEN_NPM_BIN: FAKE_NPM, FAKE_NPM_MODE: "fail" },
  });
  assert.equal(failed.status, 5);

  // The directory itself must survive (we did not create it), but
  // everything this run caused (scaffolded files + node_modules) must be
  // gone, leaving exactly the pre-existing .git.
  assert.ok(fs.existsSync(target));
  assert.deepEqual(fs.readdirSync(target), [".git"]);
  assert.equal(
    fs.readFileSync(path.join(target, ".git", "HEAD"), "utf8"),
    "ref: refs/heads/main\n",
  );

  const retried = runCli(["preexisting"], {
    cwd,
    env: { APPGEN_NPM_BIN: FAKE_NPM, FAKE_NPM_MODE: "success" },
  });
  assert.equal(retried.status, 0, retried.stderr);
  assert.ok(fs.existsSync(path.join(target, "package.json")));
  assert.ok(fs.existsSync(path.join(target, ".git", "HEAD")));
});

test("a target containing only a user .gitignore is refused with exit 3, file untouched, nothing installed", (t) => {
  // Regression for a review finding: .gitignore used to be treated as a
  // benign dotfile, so a directory containing only one was accepted and
  // then silently overwritten by scaffold's _gitignore -> .gitignore
  // rename (and, on a later install failure, left holding the TEMPLATE's
  // .gitignore because it was in the acquisition snapshot). It must now be
  // refused outright, same as any other non-empty, non-benign directory.
  const cwd = mkTmp();
  t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
  const target = path.join(cwd, "hasgitignore");
  fs.mkdirSync(target);
  fs.writeFileSync(path.join(target, ".gitignore"), "secrets.env\n*.key\n");

  const result = runCli(["hasgitignore"], {
    cwd,
    env: { APPGEN_NPM_BIN: FAKE_NPM, FAKE_NPM_MODE: "success" },
  });

  assert.equal(result.status, 3);
  assert.ok(result.stderr.includes(target));
  assert.deepEqual(fs.readdirSync(target), [".gitignore"]);
  assert.equal(
    fs.readFileSync(path.join(target, ".gitignore"), "utf8"),
    "secrets.env\n*.key\n",
  );
});

test("--no-install scaffolds files only, no node_modules, exit 0", (t) => {
  const cwd = mkTmp();
  t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));

  const result = runCli(["bareapp", "--no-install"], { cwd, env: {} });

  assert.equal(result.status, 0, result.stderr);
  const target = path.join(cwd, "bareapp");
  assert.ok(fs.existsSync(path.join(target, "package.json")));
  assert.ok(!fs.existsSync(path.join(target, "node_modules")));
});

test("--help prints usage and exits 0 without creating anything", (t) => {
  const cwd = mkTmp();
  t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));

  const result = runCli(["--help"], { cwd, env: {} });

  assert.equal(result.status, 0);
  assert.ok(result.stdout.includes("Usage"));
  assert.deepEqual(fs.readdirSync(cwd), []);
});

// --- AC2/AC11: target selection -------------------------------------------

test("no --target given still generates electron-gluestack (back-compat pin)", (t) => {
  const cwd = mkTmp();
  t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));

  const result = runCli(["notargetapp", "--no-install"], { cwd, env: {} });

  assert.equal(result.status, 0, result.stderr);
  const target = path.join(cwd, "notargetapp");
  assert.ok(fs.existsSync(path.join(target, "electron", "main.cjs")));
  assert.ok(!fs.existsSync(path.join(target, "android")));
});

test("--target react-native-android --no-install produces a working android/ Gradle project", (t) => {
  const cwd = mkTmp();
  t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));

  const result = runCli(["rnapp", "--target", "react-native-android", "--no-install"], {
    cwd,
    env: {},
  });

  assert.equal(result.status, 0, result.stderr);
  const target = path.join(cwd, "rnapp");
  assert.ok(fs.existsSync(path.join(target, "android", "settings.gradle")));
  assert.ok(fs.existsSync(path.join(target, "android", "app", "build.gradle")));
  assert.ok(!fs.existsSync(path.join(target, "node_modules")));
});

test("--target bogus exits 2, lists the valid ids, and writes nothing", (t) => {
  const cwd = mkTmp();
  t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));

  const result = runCli(["app", "--target", "bogus"], { cwd, env: {} });

  assert.equal(result.status, 2);
  assert.ok(result.stderr.includes("electron-gluestack"));
  assert.ok(result.stderr.includes("react-native-android"));
  assert.deepEqual(fs.readdirSync(cwd), []);
});

test("--help lists both target ids", (t) => {
  const cwd = mkTmp();
  t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));

  const result = runCli(["--help"], { cwd, env: {} });

  assert.equal(result.status, 0);
  assert.ok(result.stdout.includes("electron-gluestack"));
  assert.ok(result.stdout.includes("react-native-android"));
});

// --- APPGENERATOR-2 pr3: react-native-bobuttons target registration ------

test("--target react-native-bobuttons --no-install produces the vendored tarball and a working android/ Gradle project", (t) => {
  const cwd = mkTmp();
  t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));

  const result = runCli(["bbapp", "--target", "react-native-bobuttons", "--no-install"], {
    cwd,
    env: {},
  });

  assert.equal(result.status, 0, result.stderr);
  const target = path.join(cwd, "bbapp");
  assert.ok(fs.existsSync(path.join(target, "vendor", "bobuttons-0.1.0.tgz")));
  assert.ok(fs.existsSync(path.join(target, "android", "settings.gradle")));
  assert.ok(!fs.existsSync(path.join(target, "node_modules")));
});

test("--help lists all three target ids, including react-native-bobuttons", (t) => {
  const cwd = mkTmp();
  t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));

  const result = runCli(["--help"], { cwd, env: {} });

  assert.equal(result.status, 0);
  assert.ok(result.stdout.includes("electron-gluestack"));
  assert.ok(result.stdout.includes("react-native-android"));
  assert.ok(result.stdout.includes("react-native-bobuttons"));
});

test("--target bogus lists all three valid ids, including react-native-bobuttons", (t) => {
  const cwd = mkTmp();
  t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));

  const result = runCli(["app", "--target", "bogus"], { cwd, env: {} });

  assert.equal(result.status, 2);
  assert.ok(result.stderr.includes("react-native-bobuttons"));
  assert.deepEqual(fs.readdirSync(cwd), []);
});
