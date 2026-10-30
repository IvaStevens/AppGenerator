// Registry integrity + the anti-rot fitness function (docs/context
// finding 5): every binding anchor must match exactly once against the
// COMMITTED template, so upstream-format drift fails offline in `npm
// test`, not at a user's generation.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { listTargets, resolveTarget, resolveTemplateFile, DEFAULT_TARGET_ID } from "../src/targets.js";
import { run as cliRun } from "../src/cli.js";

test("DEFAULT_TARGET_ID is electron-gluestack", () => {
  assert.equal(DEFAULT_TARGET_ID, "electron-gluestack");
});

test("listTargets includes both ids", () => {
  const ids = listTargets().map((t) => t.id);
  assert.ok(ids.includes("electron-gluestack"));
  assert.ok(ids.includes("react-native-android"));
});

test("listTargets includes react-native-bobuttons (APPGENERATOR-2 pr3)", () => {
  const ids = listTargets().map((t) => t.id);
  assert.ok(ids.includes("react-native-bobuttons"));
});

test("resolveTarget returns the matching descriptor for every registered id", () => {
  for (const { id } of listTargets()) {
    const target = resolveTarget(id);
    assert.equal(target.id, id);
    assert.ok(fs.existsSync(target.templateDir), `templateDir for "${id}" must exist`);
  }
});

test("resolveTarget throws a usage-shaped error (exit 2) listing valid ids for an unknown target", () => {
  assert.throws(
    () => resolveTarget("bogus-target"),
    (err) => {
      assert.equal(err.exitCode, 2);
      assert.match(err.message, /electron-gluestack/);
      assert.match(err.message, /react-native-android/);
      return true;
    },
  );
});

test("every id appears in --help output", async () => {
  const chunks = [];
  const origWrite = process.stdout.write;
  process.stdout.write = (chunk) => {
    chunks.push(chunk);
    return true;
  };
  try {
    await cliRun(["--help"], { cwd: process.cwd() });
  } finally {
    process.stdout.write = origWrite;
  }
  const output = chunks.join("");
  for (const { id } of listTargets()) {
    assert.ok(output.includes(id), `--help output must mention target "${id}"`);
  }
});

test("every 'line' and 'json' binding file exists in its target's committed template (or its shared source - APPGENERATOR-2 pr3)", () => {
  for (const { id } of listTargets()) {
    const target = resolveTarget(id);
    for (const binding of target.bindings) {
      if (binding.op === "json" || binding.op === "line") {
        const filePath = resolveTemplateFile(target, binding.file);
        assert.ok(
          fs.existsSync(filePath),
          `target "${target.id}": binding file "${binding.file}" does not exist in the template`,
        );
      }
    }
  }
});

test("every 'line' binding anchor matches EXACTLY ONCE against the committed template (anti-rot fitness function)", () => {
  for (const { id } of listTargets()) {
    const target = resolveTarget(id);
    for (const binding of target.bindings) {
      if (binding.op !== "line") continue;
      const filePath = resolveTemplateFile(target, binding.file);
      const raw = fs.readFileSync(filePath, "utf8");
      const matches = raw.match(new RegExp(binding.anchor, "g"));
      const count = matches ? matches.length : 0;
      assert.equal(
        count,
        1,
        `target "${target.id}": anchor ${binding.anchor} matched ${count} time(s) in "${binding.file}" (expected exactly 1)`,
      );
    }
  }
});

test("react-native-android's moveDir source exists in the committed template", () => {
  const target = resolveTarget("react-native-android");
  const moveDirBindings = target.bindings.filter((b) => b.op === "moveDir");
  assert.equal(moveDirBindings.length, 1);
  const from = moveDirBindings[0].from({});
  assert.ok(fs.existsSync(path.join(target.templateDir, from)));
});

test("electron-gluestack's registry entry reproduces today's constants exactly", () => {
  const target = resolveTarget("electron-gluestack");
  assert.deepEqual(target.skip, ["node_modules", "dist"]);
  assert.deepEqual(target.dotfiles, ["_gitignore"]);
  assert.equal(target.derive, null);
  assert.equal(target.bindings.length, 2);
  assert.ok(target.bindings.every((b) => b.op === "json"));
});

test("react-native-android's skip list covers every Gradle/Kotlin build-output directory", () => {
  const target = resolveTarget("react-native-android");
  for (const entry of ["node_modules", "dist", ".gradle", "build", ".cxx", ".kotlin", "local.properties"]) {
    assert.ok(target.skip.includes(entry), `skip list must include "${entry}"`);
  }
});

// --- APPGENERATOR-2 pr3: react-native-bobuttons registration + shared ---
// --- Android scaffolding (AC "target shape decided explicitly")       ---

test("electron-gluestack and react-native-android declare no vendored deps (vendoredDeps: [])", () => {
  assert.deepEqual(resolveTarget("electron-gluestack").vendoredDeps, []);
  assert.deepEqual(resolveTarget("react-native-android").vendoredDeps, []);
});

test("react-native-bobuttons declares bobuttons as its one vendored dependency", () => {
  assert.deepEqual(resolveTarget("react-native-bobuttons").vendoredDeps, ["bobuttons"]);
});

test("react-native-bobuttons shares react-native-android's Android/Gradle binding table BY REFERENCE (one table, not a duplicate)", () => {
  const rn = resolveTarget("react-native-android");
  const bobuttons = resolveTarget("react-native-bobuttons");
  assert.equal(bobuttons.bindings, rn.bindings, "the two targets must reuse the exact same bindings array");
});

test("react-native-bobuttons' Android source is react-native-android's committed android/ tree, not a second copy", () => {
  const rn = resolveTarget("react-native-android");
  const bobuttons = resolveTarget("react-native-bobuttons");
  assert.equal(bobuttons.sharedDirs.length, 1);
  assert.equal(bobuttons.sharedDirs[0].dest, "android");
  assert.equal(bobuttons.sharedDirs[0].src, path.join(rn.templateDir, "android"));
  assert.ok(
    !fs.existsSync(path.join(bobuttons.templateDir, "android")),
    "react-native-bobuttons' own template tree must not carry a second android/ directory",
  );
});

test("react-native-bobuttons' moveDir source resolves to an existing file via the shared Android tree", () => {
  const target = resolveTarget("react-native-bobuttons");
  const moveDirBindings = target.bindings.filter((b) => b.op === "moveDir");
  assert.equal(moveDirBindings.length, 1);
  const from = moveDirBindings[0].from({});
  assert.ok(fs.existsSync(resolveTemplateFile(target, from)));
});
