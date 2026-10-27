// AC12: "unchanged output" asserted by a test, not assumed. Pins
// electron-gluestack's generated output with a fixed app name: the exact
// sorted file manifest, the verbatim generated package.json content, and
// a committed SHA-256 of the generated package-lock.json.
//
// Deliberate-update recipe, if the electron-gluestack template is ever
// changed on purpose: regenerate with the SAME fixed app name
// ("output-pin-app") used below, inspect the diff against this file's
// expectations, and update EXPECTED_MANIFEST / EXPECTED_PACKAGE_JSON /
// EXPECTED_LOCKFILE_SHA256 together in the same commit as the template
// change - never update this file to make a test pass without first
// understanding why the generated output changed.
//
// react-native-android cases below (APPGENERATOR-2 AC5/AC17) pin that
// target's generated output BEFORE its template tree is promoted to a
// shared asset (the react-native-bobuttons target shares the Android
// scaffolding instead of duplicating it), so the sharing refactor is
// provably output-identical for this pre-existing target. Same
// deliberate-update recipe: regenerate with the fixed app name
// ("output-pin-rn-app") below, inspect the diff, and update
// EXPECTED_RN_MANIFEST / the name-bearing file constants /
// EXPECTED_RN_BUILD_GRADLE_SHA256 / EXPECTED_RN_LOCKFILE_SHA256 together
// in the same commit as an intentional template change.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { scaffold } from "../src/scaffold.js";

const APP_NAME = "output-pin-app";

const EXPECTED_MANIFEST = [
  ".gitignore",
  "README.md",
  "electron/main.cjs",
  "index.html",
  "package-lock.json",
  "package.json",
  "shims/assets-registry.js",
  "src/App.jsx",
  "src/renderer.jsx",
  "src/ui/index.jsx",
  "vite.config.mjs",
];

const EXPECTED_PACKAGE_JSON = `{
  "name": "output-pin-app",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "electron/main.cjs",
  "engines": {
    "node": ">=22.12.0"
  },
  "scripts": {
    "build": "vite build",
    "start": "npm run build && electron .",
    "smoke": "npm run build && SMOKE_TEST=1 electron ."
  },
  "dependencies": {
    "@gluestack-style/react": "1.0.57",
    "@gluestack-ui/config": "1.1.20",
    "@gluestack-ui/themed": "1.1.73",
    "buffer": "6.0.3",
    "react": "19.3.0",
    "react-dom": "19.3.0",
    "react-native-svg": "15.14.0",
    "react-native-web": "0.21.4"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "5.2.0",
    "electron": "44.7.1",
    "vite": "7.3.7"
  }
}
`;

const EXPECTED_LOCKFILE_SHA256 =
  "b8f136a1cd1841995ab14a2262ff5523d473fc5cb2808ded699b239c44210036";

function listAllFiles(dir, root = dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listAllFiles(p, root));
    else out.push(path.relative(root, p).split(path.sep).join("/"));
  }
  return out;
}

test("electron-gluestack: generated file manifest is exactly the pinned 11 entries", (t) => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "appgen-output-pin-"));
  t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
  const target = path.join(cwd, APP_NAME);
  fs.mkdirSync(target);

  scaffold(target, { appName: APP_NAME });

  assert.deepEqual(listAllFiles(target).sort(), [...EXPECTED_MANIFEST].sort());
});

test("electron-gluestack: generated package.json is byte-for-byte the pinned content", (t) => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "appgen-output-pin-"));
  t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
  const target = path.join(cwd, APP_NAME);
  fs.mkdirSync(target);

  scaffold(target, { appName: APP_NAME });

  const actual = fs.readFileSync(path.join(target, "package.json"), "utf8");
  assert.equal(actual, EXPECTED_PACKAGE_JSON);
});

test("electron-gluestack: generated package-lock.json hashes to the pinned SHA-256", (t) => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "appgen-output-pin-"));
  t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
  const target = path.join(cwd, APP_NAME);
  fs.mkdirSync(target);

  scaffold(target, { appName: APP_NAME });

  const raw = fs.readFileSync(path.join(target, "package-lock.json"));
  const sha256 = crypto.createHash("sha256").update(raw).digest("hex");
  assert.equal(sha256, EXPECTED_LOCKFILE_SHA256);
});

// --- react-native-android ---------------------------------------------

const RN_APP_NAME = "output-pin-rn-app";
const RN_TARGET_ID = "react-native-android";
const RN_KOTLIN_DIR = "android/app/src/main/java/com/output_pin_rn_app";

function rnDerived() {
  return { segment: "output_pin_rn_app", applicationId: "com.output_pin_rn_app" };
}

const EXPECTED_RN_MANIFEST = [
  ".eslintrc.js",
  ".gitignore",
  ".prettierrc.js",
  ".watchmanconfig",
  "App.tsx",
  "README.md",
  "THIRD-PARTY-NOTICE.md",
  "__tests__/App.test.tsx",
  "android/app/build.gradle",
  "android/app/debug.keystore",
  "android/app/proguard-rules.pro",
  "android/app/src/main/AndroidManifest.xml",
  `${RN_KOTLIN_DIR}/MainActivity.kt`,
  `${RN_KOTLIN_DIR}/MainApplication.kt`,
  "android/app/src/main/res/drawable/rn_edit_text_material.xml",
  "android/app/src/main/res/mipmap-hdpi/ic_launcher.png",
  "android/app/src/main/res/mipmap-hdpi/ic_launcher_round.png",
  "android/app/src/main/res/mipmap-mdpi/ic_launcher.png",
  "android/app/src/main/res/mipmap-mdpi/ic_launcher_round.png",
  "android/app/src/main/res/mipmap-xhdpi/ic_launcher.png",
  "android/app/src/main/res/mipmap-xhdpi/ic_launcher_round.png",
  "android/app/src/main/res/mipmap-xxhdpi/ic_launcher.png",
  "android/app/src/main/res/mipmap-xxhdpi/ic_launcher_round.png",
  "android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png",
  "android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_round.png",
  "android/app/src/main/res/values/strings.xml",
  "android/app/src/main/res/values/styles.xml",
  "android/build.gradle",
  "android/gradle.properties",
  "android/gradle/wrapper/gradle-wrapper.jar",
  "android/gradle/wrapper/gradle-wrapper.properties",
  "android/gradlew",
  "android/gradlew.bat",
  "android/settings.gradle",
  "app.json",
  "babel.config.js",
  "index.js",
  "jest.config.js",
  "metro.config.js",
  "package-lock.json",
  "package.json",
  "tsconfig.json",
];

const EXPECTED_RN_PACKAGE_JSON = `{
  "name": "output-pin-rn-app",
  "version": "0.0.1",
  "private": true,
  "scripts": {
    "android": "react-native run-android",
    "lint": "eslint .",
    "start": "react-native start",
    "test": "jest"
  },
  "dependencies": {
    "react": "19.2.0",
    "react-native": "0.83.10",
    "@react-native/new-app-screen": "0.83.10",
    "react-native-safe-area-context": "5.10.1"
  },
  "devDependencies": {
    "@babel/core": "7.29.7",
    "@babel/preset-env": "7.29.7",
    "@babel/runtime": "7.29.10",
    "@react-native-community/cli": "20.0.0",
    "@react-native-community/cli-platform-android": "20.0.0",
    "@react-native/babel-preset": "0.83.10",
    "@react-native/eslint-config": "0.83.10",
    "@react-native/metro-config": "0.83.10",
    "@react-native/typescript-config": "0.83.10",
    "@types/jest": "29.5.14",
    "@types/react": "19.3.0",
    "@types/react-test-renderer": "19.3.0",
    "eslint": "8.57.1",
    "jest": "29.7.0",
    "prettier": "2.8.8",
    "react-test-renderer": "19.2.0",
    "typescript": "5.9.3"
  },
  "engines": {
    "node": ">=22.12.0"
  }
}
`;

const EXPECTED_RN_APP_JSON = `{
  "name": "output-pin-rn-app",
  "displayName": "output-pin-rn-app"
}
`;

const EXPECTED_RN_SETTINGS_GRADLE = `pluginManagement { includeBuild("../node_modules/@react-native/gradle-plugin") }
plugins { id("com.facebook.react.settings") }
extensions.configure(com.facebook.react.ReactSettingsExtension){ ex -> ex.autolinkLibrariesFromCommand() }
rootProject.name = 'output_pin_rn_app'
include ':app'
includeBuild('../node_modules/@react-native/gradle-plugin')
`;

const EXPECTED_RN_MAIN_ACTIVITY_KT = `package com.output_pin_rn_app

import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

class MainActivity : ReactActivity() {

  /**
   * Returns the name of the main component registered from JavaScript. This is used to schedule
   * rendering of the component.
   */
  override fun getMainComponentName(): String = "output-pin-rn-app"

  /**
   * Returns the instance of the [ReactActivityDelegate]. We use [DefaultReactActivityDelegate]
   * which allows you to enable New Architecture with a single boolean flags [fabricEnabled]
   */
  override fun createReactActivityDelegate(): ReactActivityDelegate =
      DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)
}
`;

const EXPECTED_RN_MAIN_APPLICATION_KT = `package com.output_pin_rn_app

import android.app.Application
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost

class MainApplication : Application(), ReactApplication {

  override val reactHost: ReactHost by lazy {
    getDefaultReactHost(
      context = applicationContext,
      packageList =
        PackageList(this).packages.apply {
          // Packages that cannot be autolinked yet can be added manually here, for example:
          // add(MyReactNativePackage())
        },
    )
  }

  override fun onCreate() {
    super.onCreate()
    loadReactNative(this)
  }
}
`;

const EXPECTED_RN_STRINGS_XML = `<resources>
    <string name="app_name">output-pin-rn-app</string>
</resources>
`;

const EXPECTED_RN_BUILD_GRADLE_SHA256 =
  "cbc56b220e7ecaa7b255275047400e82938488c13a43cc349b489307a0ade36b";

const EXPECTED_RN_LOCKFILE_SHA256 =
  "29033e512e4b21954b974f2128d879be2e71870de812296116bcbff0d4c6ecd1";

function generateRnApp(t) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "appgen-output-pin-rn-"));
  t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
  const target = path.join(cwd, RN_APP_NAME);
  fs.mkdirSync(target);

  scaffold(target, { appName: RN_APP_NAME, targetId: RN_TARGET_ID, derived: rnDerived() });

  return target;
}

test("react-native-android: generated file manifest is exactly the pinned entries", (t) => {
  const target = generateRnApp(t);

  assert.deepEqual(listAllFiles(target).sort(), [...EXPECTED_RN_MANIFEST].sort());
});

test("react-native-android: name-bearing generated files are byte-for-byte the pinned content", (t) => {
  const target = generateRnApp(t);

  assert.equal(fs.readFileSync(path.join(target, "package.json"), "utf8"), EXPECTED_RN_PACKAGE_JSON);
  assert.equal(fs.readFileSync(path.join(target, "app.json"), "utf8"), EXPECTED_RN_APP_JSON);
  assert.equal(
    fs.readFileSync(path.join(target, "android/settings.gradle"), "utf8"),
    EXPECTED_RN_SETTINGS_GRADLE,
  );
  assert.equal(
    fs.readFileSync(path.join(target, `${RN_KOTLIN_DIR}/MainActivity.kt`), "utf8"),
    EXPECTED_RN_MAIN_ACTIVITY_KT,
  );
  assert.equal(
    fs.readFileSync(path.join(target, `${RN_KOTLIN_DIR}/MainApplication.kt`), "utf8"),
    EXPECTED_RN_MAIN_APPLICATION_KT,
  );
  assert.equal(
    fs.readFileSync(path.join(target, "android/app/src/main/res/values/strings.xml"), "utf8"),
    EXPECTED_RN_STRINGS_XML,
  );
});

test("react-native-android: build.gradle and package-lock.json hash to the pinned SHA-256", (t) => {
  const target = generateRnApp(t);

  const buildGradle = fs.readFileSync(path.join(target, "android/app/build.gradle"));
  assert.equal(
    crypto.createHash("sha256").update(buildGradle).digest("hex"),
    EXPECTED_RN_BUILD_GRADLE_SHA256,
  );

  const lockfile = fs.readFileSync(path.join(target, "package-lock.json"));
  assert.equal(
    crypto.createHash("sha256").update(lockfile).digest("hex"),
    EXPECTED_RN_LOCKFILE_SHA256,
  );
});
