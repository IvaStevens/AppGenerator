// The react-native-bobuttons target's generation behaviour (APPGENERATOR-2
// pr3). Deliberately proportionate: the full adversarial-name binding
// coverage and the "no template identity leak" property already have an
// equivalent for react-native-android in test/scaffold-rn.test.js, and
// test/targets.test.js already proves the two targets share the exact
// same binding table and Android source tree - so this file checks the
// things that are specific to THIS target: the vendored tarball survives
// generation, the shared Android tree is used (not duplicated), and no
// ios/.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { scaffold } from "../src/scaffold.js";
import { resolveTarget } from "../src/targets.js";
import { androidSegment, applicationId } from "../src/android-identifier.js";

const TARGET_ID = "react-native-bobuttons";
const TARGET_DEF = resolveTarget(TARGET_ID);

function generate(appName) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "appgen-scaffold-bobuttons-"));
  const target = path.join(cwd, appName);
  fs.mkdirSync(target);
  const derived = { segment: androidSegment(appName), applicationId: applicationId(appName) };
  scaffold(target, { appName, targetId: TARGET_ID, derived });
  return { cwd, target };
}

test("the vendored bobuttons tarball is byte-identical to the template's, at the documented path", (t) => {
  const { cwd, target } = generate("my-bobuttons-app");
  t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));

  const generatedTarball = fs.readFileSync(path.join(target, "vendor", "bobuttons-0.1.0.tgz"));
  const templateTarball = fs.readFileSync(
    path.join(TARGET_DEF.templateDir, "vendor", "bobuttons-0.1.0.tgz"),
  );
  assert.ok(generatedTarball.equals(templateTarball));
});

test("the Android/Gradle project is generated from the SHARED react-native-android tree, correctly bound, and no ios/", (t) => {
  const appName = "my-bobuttons-app";
  const { cwd, target } = generate(appName);
  t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));

  const segment = androidSegment(appName);
  const appId = applicationId(appName);

  const buildGradle = fs.readFileSync(path.join(target, "android/app/build.gradle"), "utf8");
  assert.match(buildGradle, new RegExp(`namespace "${appId}"`));
  assert.match(buildGradle, new RegExp(`applicationId "${appId}"`));

  const kotlinDir = path.join(target, "android/app/src/main/java/com", segment);
  assert.ok(fs.existsSync(kotlinDir));

  const mainActivity = fs.readFileSync(path.join(kotlinDir, "MainActivity.kt"), "utf8");
  assert.match(mainActivity, new RegExp(`^package ${appId.replace(/\./g, "\\.")}`, "m"));
  assert.match(mainActivity, /getMainComponentName\(\): String = "my-bobuttons-app"/);

  const settingsGradle = fs.readFileSync(path.join(target, "android/settings.gradle"), "utf8");
  assert.match(settingsGradle, new RegExp(`rootProject\\.name = '${segment}'`));

  // Byte-identical to react-native-android's committed binaries (the
  // shared source, not a second copy).
  const rnAndroidDir = resolveTarget("react-native-android").templateDir;
  for (const relPath of ["android/gradle/wrapper/gradle-wrapper.jar", "android/app/debug.keystore"]) {
    const generated = fs.readFileSync(path.join(target, relPath));
    const shared = fs.readFileSync(path.join(rnAndroidDir, relPath));
    assert.ok(generated.equals(shared), `${relPath} is not byte-identical to the shared Android tree`);
  }

  assert.ok(!fs.existsSync(path.join(target, "ios")));
});

test("app.json.name equals MainActivity.getMainComponentName() (site 3 === site 8)", (t) => {
  const appName = "another-app";
  const { cwd, target } = generate(appName);
  t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));

  const appJson = JSON.parse(fs.readFileSync(path.join(target, "app.json"), "utf8"));
  const segment = androidSegment(appName);
  const mainActivity = fs.readFileSync(
    path.join(target, "android/app/src/main/java/com", segment, "MainActivity.kt"),
    "utf8",
  );
  const match = mainActivity.match(/getMainComponentName\(\): String = "([^"]*)"/);
  assert.ok(match);
  assert.equal(appJson.name, match[1]);
});

test("no react-native-bobuttons template identity leaks into the generated app", (t) => {
  const appName = "distinctivebobuttons123";
  const { cwd, target } = generate(appName);
  t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));

  const forbidden = ["appgen-rn-template", "appgenrntemplate", "appgen-bobuttons-template", "appgenbobuttonstemplate"];
  const TEXT_FILE_RE = /\.(json|js|jsx|ts|tsx|md|gradle|properties|xml|pro|txt)$/;

  function listAllFiles(dir) {
    const out = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) out.push(...listAllFiles(p));
      else out.push(p);
    }
    return out;
  }

  for (const f of listAllFiles(target)) {
    const base = path.basename(f);
    if (TEXT_FILE_RE.test(f) === false && base !== "gradlew" && !base.startsWith(".")) continue;
    if (["gradle-wrapper.jar", "debug.keystore"].includes(base)) continue;
    const content = fs.readFileSync(f, "utf8");
    for (const token of forbidden) {
      assert.ok(!content.toLowerCase().includes(token.toLowerCase()), `file "${f}" contains forbidden token "${token}"`);
    }
  }
});
