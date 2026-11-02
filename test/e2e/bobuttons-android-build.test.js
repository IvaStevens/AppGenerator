// Opt-in (APPGEN_E2E=1) proof of the "Android debug build, with proof
// defined" acceptance criterion for the react-native-bobuttons target:
// the generated app produces a real Android debug build with zero edits
// to the generated sources or config.
//
// Skips with a one-line reason when APPGEN_E2E is not set. FAILS LOUDLY
// (does not skip) when APPGEN_E2E=1 IS set and a prerequisite (java on
// PATH; ANDROID_HOME/ANDROID_SDK_ROOT set and containing platform-tools)
// is missing, naming exactly which one, so this acceptance proof can
// never silently evaporate. Mirrors test/e2e/android-build.test.js.

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
  "generate --target react-native-bobuttons -> gradlew assembleDebug -> app-debug.apk",
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
          "\"React Native bobuttons target\" section for the exact command.",
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

    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "appgen-e2e-bobuttons-"));
    t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));

    // Install enabled by default - npm ci against the committed lockfile,
    // no manual intervention, exercising the vendored bobuttons tarball.
    const gen = spawnSync(process.execPath, [BIN, "e2ebobuttonsapp", "--target", "react-native-bobuttons"], {
      cwd,
      encoding: "utf8",
    });
    assert.equal(gen.status, 0, `generation failed:\n${gen.stderr}`);

    const target = path.join(cwd, "e2ebobuttonsapp");
    assert.ok(fs.existsSync(path.join(target, "node_modules")));

    // Zero edits to the generated sources or config.
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
