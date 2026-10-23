// The react-native-android target's behaviour: the full §5.3 binding
// table, the §5.4 adversarial-name consistency check (the offline proxy
// for AC4's "every accepted name yields a buildable app"), and the
// no-template-identity-leak property (AC5(b)).

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { scaffold } from "../src/scaffold.js";
import { resolveTarget } from "../src/targets.js";
import { androidSegment, applicationId } from "../src/android-identifier.js";

const TARGET_ID = "react-native-android";
const TEMPLATE_ROOT = resolveTarget(TARGET_ID).templateDir;

function mkTmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "appgen-scaffold-rn-"));
}

function generate(appName) {
  const cwd = mkTmp();
  const target = path.join(cwd, appName);
  fs.mkdirSync(target);
  const derived = { segment: androidSegment(appName), applicationId: applicationId(appName) };
  scaffold(target, { appName, targetId: TARGET_ID, derived });
  return { cwd, target };
}

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

function isLikelyTextFile(filePath) {
  return /\.(json|js|jsx|ts|tsx|md|gradle|properties|xml|pro|txt)$/.test(filePath) ||
    path.basename(filePath) === "gradlew" ||
    path.basename(filePath).startsWith(".");
}

const KNOWN_BINARIES = ["gradle-wrapper.jar", "debug.keystore"];

test("ADVERSARIAL NAMES: namespace == applicationId == both Kotlin package decls == the Kotlin dir path, for every name the validator accepts that is Java-illegal", (t) => {
  for (const appName of ["my-app", "1app", "a.b", "class"]) {
    const { cwd, target } = generate(appName);
    t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));

    const segment = androidSegment(appName);
    const appId = applicationId(appName);

    const buildGradle = fs.readFileSync(path.join(target, "android/app/build.gradle"), "utf8");
    assert.match(buildGradle, new RegExp(`namespace "${appId}"`));
    assert.match(buildGradle, new RegExp(`applicationId "${appId}"`));

    const kotlinDir = path.join(target, "android/app/src/main/java/com", segment);
    assert.ok(fs.existsSync(kotlinDir), `expected Kotlin dir at ${kotlinDir} for app "${appName}"`);

    const mainActivity = fs.readFileSync(path.join(kotlinDir, "MainActivity.kt"), "utf8");
    const mainApplication = fs.readFileSync(path.join(kotlinDir, "MainApplication.kt"), "utf8");
    assert.match(mainActivity, new RegExp(`^package ${appId.replace(/\./g, "\\.")}`, "m"));
    assert.match(mainApplication, new RegExp(`^package ${appId.replace(/\./g, "\\.")}`, "m"));

    const settingsGradle = fs.readFileSync(path.join(target, "android/settings.gradle"), "utf8");
    assert.match(settingsGradle, new RegExp(`rootProject\\.name = '${segment}'`));
  }
});

test("app.json.name === MainActivity.getMainComponentName() (site 3 === site 8)", (t) => {
  const appName = "my-app";
  const { cwd, target } = generate(appName);
  t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));

  const appJson = JSON.parse(fs.readFileSync(path.join(target, "app.json"), "utf8"));
  const segment = androidSegment(appName);
  const mainActivity = fs.readFileSync(
    path.join(target, "android/app/src/main/java/com", segment, "MainActivity.kt"),
    "utf8",
  );
  const match = mainActivity.match(/getMainComponentName\(\): String = "([^"]*)"/);
  assert.ok(match, "getMainComponentName() not found");
  assert.equal(appJson.name, match[1]);
  assert.equal(appJson.displayName, appName);
});

test("strings.xml app_name is bound to the app name", (t) => {
  const appName = "cool-app";
  const { cwd, target } = generate(appName);
  t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));

  const strings = fs.readFileSync(
    path.join(target, "android/app/src/main/res/values/strings.xml"),
    "utf8",
  );
  assert.match(strings, /<string name="app_name">cool-app<\/string>/);
});

test("AndroidManifest.xml has NO package attribute (AGP >=8 rejects one in a source manifest)", (t) => {
  const { cwd, target } = generate("app");
  t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));

  const manifest = fs.readFileSync(
    path.join(target, "android/app/src/main/AndroidManifest.xml"),
    "utf8",
  );
  assert.ok(!/\bpackage\s*=/.test(manifest), "manifest must not declare a package attribute");
});

test("gradlew is executable, jar and keystore are byte-identical to the template, no ios/", (t) => {
  const { cwd, target } = generate("app");
  t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));

  const gradlewMode = fs.statSync(path.join(target, "android/gradlew")).mode & 0o777;
  assert.equal(gradlewMode & 0o100, 0o100, "gradlew must be executable by owner");

  for (const relPath of [
    "android/gradle/wrapper/gradle-wrapper.jar",
    "android/app/debug.keystore",
  ]) {
    const generated = fs.readFileSync(path.join(target, relPath));
    const template = fs.readFileSync(path.join(TEMPLATE_ROOT, relPath));
    assert.ok(generated.equals(template), `${relPath} is not byte-identical to the template`);
  }

  assert.ok(!fs.existsSync(path.join(target, "ios")));
});

test("two different app names get two different applicationIds", (t) => {
  const a = generate("app-one");
  const b = generate("app-two");
  t.after(() => {
    fs.rmSync(a.cwd, { recursive: true, force: true });
    fs.rmSync(b.cwd, { recursive: true, force: true });
  });

  const buildGradleA = fs.readFileSync(path.join(a.target, "android/app/build.gradle"), "utf8");
  const buildGradleB = fs.readFileSync(path.join(b.target, "android/app/build.gradle"), "utf8");
  const idA = buildGradleA.match(/applicationId "([^"]*)"/)[1];
  const idB = buildGradleB.match(/applicationId "([^"]*)"/)[1];
  assert.notEqual(idA, idB);
});

test("no template identity leaks into any generated file, content or path (text files scanned; known binaries byte-compared)", (t) => {
  const appName = "distinctivename123";
  const { cwd, target } = generate(appName);
  t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));

  const forbidden = ["appgen-rn-template", "appgenrntemplate", "helloworld", "Hello App Display Name"];

  for (const f of listAllFiles(target)) {
    const base = path.basename(f);
    const relPath = path.relative(target, f);

    // Path check (case-insensitive) on every file, including binaries.
    for (const token of forbidden) {
      assert.ok(
        !relPath.toLowerCase().includes(token.toLowerCase().replace(/\s+/g, "")),
        `path "${relPath}" contains forbidden token "${token}"`,
      );
    }

    if (KNOWN_BINARIES.includes(base)) continue; // byte-compared elsewhere
    if (!isLikelyTextFile(f)) continue;

    const content = fs.readFileSync(f, "utf8");
    for (const token of forbidden) {
      assert.ok(
        !content.toLowerCase().includes(token.toLowerCase()),
        `file "${relPath}" contains forbidden token "${token}"`,
      );
    }
  }
});

test("node_modules, dist, build, .gradle, .cxx, .kotlin, local.properties are never copied, even if present in the template", (t) => {
  const { cwd, target } = generate("app");
  t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));

  for (const entry of ["node_modules", "dist", "build", ".gradle", ".cxx", ".kotlin", "local.properties"]) {
    const found = listAllFiles(target).some((f) => f.split(path.sep).includes(entry)) ||
      fs.existsSync(path.join(target, entry)) ||
      fs.existsSync(path.join(target, "android", entry)) ||
      fs.existsSync(path.join(target, "android", "app", entry));
    assert.ok(!found, `"${entry}" must never be copied into a generated app`);
  }
});
