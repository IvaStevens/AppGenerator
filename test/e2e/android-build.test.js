// Opt-in (APPGEN_E2E=1) proof of AC8/AC9: the generated react-native-android
// app produces a real Android debug build with zero edits to the
// generated sources or config.
//
// Skips with a one-line reason when APPGEN_E2E is not set. FAILS LOUDLY
// (does not skip) when APPGEN_E2E=1 IS set and a prerequisite (java on
// PATH; ANDROID_HOME/ANDROID_SDK_ROOT set and containing platform-tools)
// is missing, naming exactly which one, so this acceptance proof can
// never silently evaporate. Mirrors test/e2e/full-generate.test.js.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BIN = path.join(__dirname, "..", "..", "bin", "appgenerator.js");

const E2E_REQUESTED = process.env.APPGEN_E2E === "1";

function hasJava() {
  const r = spawnSync("which", ["java"], { encoding: "utf8" });
  return r.status === 0;
}

function androidSdkRoot() {
  return process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || "";
}

function hasPlatformTools(sdkRoot) {
  return Boolean(sdkRoot) && fs.existsSync(path.join(sdkRoot, "platform-tools"));
}

test(
  "generate --target react-native-android -> gradlew assembleDebug -> app-debug.apk proves AC8",
  { timeout: 10 * 60 * 1000 },
  (t) => {
    if (!E2E_REQUESTED) {
      t.skip("APPGEN_E2E not set; skipping the opt-in network+Android e2e test.");
      return;
    }

    if (!hasJava()) {
      assert.fail(
        "APPGEN_E2E=1 was set but no `java` was found on PATH. Install a " +
          "JDK 17+ and re-run, or build manually: see README.md's " +
          "\"React Native Android target\" section for the exact command.",
      );
      return;
    }

    const sdkRoot = androidSdkRoot();
    if (!sdkRoot) {
      assert.fail(
        "APPGEN_E2E=1 was set but neither ANDROID_HOME nor ANDROID_SDK_ROOT " +
          "is set. Install the Android SDK, set one of those, accept the " +
          "SDK licences (sdkmanager --licenses), and re-run.",
      );
      return;
    }

    if (!hasPlatformTools(sdkRoot)) {
      assert.fail(
        `APPGEN_E2E=1 was set but "${sdkRoot}" does not contain platform-tools. ` +
          "Install platform-tools via sdkmanager and re-run.",
      );
      return;
    }

    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "appgen-e2e-android-"));
    t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));

    // AC7: install enabled by default - npm ci against the committed
    // lockfile, no manual intervention.
    const gen = spawnSync(process.execPath, [BIN, "e2eandroidapp", "--target", "react-native-android"], {
      cwd,
      encoding: "utf8",
    });
    assert.equal(gen.status, 0, `generation failed:\n${gen.stderr}`);

    const target = path.join(cwd, "e2eandroidapp");
    assert.ok(fs.existsSync(path.join(target, "node_modules")));

    // AC8: zero edits to the generated sources or config.
    const build = spawnSync(
      path.join(target, "android", "gradlew"),
      ["assembleDebug", "--no-daemon"],
      { cwd: path.join(target, "android"), encoding: "utf8", shell: false },
    );

    assert.equal(
      build.status,
      0,
      `./gradlew assembleDebug failed:\nstdout: ${build.stdout}\nstderr: ${build.stderr}`,
    );

    const apk = path.join(target, "android", "app", "build", "outputs", "apk", "debug", "app-debug.apk");
    assert.ok(fs.existsSync(apk), `expected debug APK at ${apk}`);
  },
);
