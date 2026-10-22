// Opt-in (APPGEN_E2E=1) proof of AC1/AC2/AC3 against a freshly generated
// app with no manual steps: real `npm ci`, real Electron binary
// front-load, `npm run build`, then the smoke launch asserting a window
// was created and the gluestack placeholder rendered.
//
// Skips with a one-line reason when APPGEN_E2E is not set. FAILS LOUDLY
// (does not skip) when APPGEN_E2E=1 IS set and there is no DISPLAY /
// WAYLAND_DISPLAY and no xvfb-run on PATH, so the acceptance proof can
// never silently evaporate.

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

function hasXvfbRun() {
  const r = spawnSync("which", ["xvfb-run"], { encoding: "utf8" });
  return r.status === 0;
}

function hasDisplay() {
  return Boolean(process.env.DISPLAY || process.env.WAYLAND_DISPLAY);
}

test(
  "full generate -> npm ci -> electron front-load -> build -> smoke launch proves AC1/AC2/AC3",
  { timeout: 10 * 60 * 1000 },
  (t) => {
    if (!E2E_REQUESTED) {
      t.skip("APPGEN_E2E not set; skipping the opt-in network+Electron e2e test.");
      return;
    }

    if (!hasDisplay() && !hasXvfbRun()) {
      assert.fail(
        "APPGEN_E2E=1 was set but no DISPLAY/WAYLAND_DISPLAY is set and xvfb-run " +
          "is not on PATH. This test must fail rather than skip so the AC1/AC2/AC3 " +
          "proof is never silently lost. Run under a display, or: xvfb-run -a npm run test:e2e",
      );
      return;
    }

    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "appgen-e2e-"));
    t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));

    // AC1: no manual steps - the default install runs both phases.
    const gen = spawnSync(process.execPath, [BIN, "e2eapp"], {
      cwd,
      encoding: "utf8",
    });
    assert.equal(gen.status, 0, `generation failed:\n${gen.stderr}`);

    const target = path.join(cwd, "e2eapp");
    assert.ok(fs.existsSync(path.join(target, "node_modules", "electron")));

    // AC2/AC3: the generated app's own documented self-check proves the
    // window and the gluestack-ui placeholder.
    const useXvfb = !hasDisplay();
    const smokeArgs = useXvfb
      ? ["xvfb-run", "-a", "npm", "run", "smoke"]
      : ["npm", "run", "smoke"];
    const smoke = spawnSync(smokeArgs[0], smokeArgs.slice(1), {
      cwd: target,
      encoding: "utf8",
      env: { ...process.env },
    });

    assert.equal(
      smoke.status,
      0,
      `smoke launch failed:\nstdout: ${smoke.stdout}\nstderr: ${smoke.stderr}`,
    );
    assert.ok(smoke.stdout.includes('"hasScreen":true'));
    assert.ok(smoke.stdout.includes('"hasButton":true'));
    assert.ok(smoke.stdout.includes("CONSOLE_ERRORS=[]"));
  },
);
