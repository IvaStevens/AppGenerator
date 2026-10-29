// Offline smoke test for the still-unregistered react-native-bobuttons
// template tree (this is PR 2 of the APPGENERATOR-2 series; the target is
// registered in src/targets.js by a later PR). Deliberately small per the
// owner's trim decision: only that the template's key files exist, that
// the vendored bobuttons tarball is present, and that the template's
// App.tsx wraps the tree in BobuttonsProvider with no TamaguiProvider.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATE_DIR = path.join(__dirname, "..", "templates", "react-native-bobuttons");

test("react-native-bobuttons template: key files exist", () => {
  const expected = [
    "package.json",
    "package-lock.json",
    "App.tsx",
    "app.json",
    "index.js",
    "jest.config.js",
    "babel.config.js",
    "metro.config.js",
    "tsconfig.json",
    "README.md",
    "THIRD-PARTY-NOTICE.md",
    "_gitignore",
    "_eslintrc.js",
    "_prettierrc.js",
    "_watchmanconfig",
    "components/icons/index.ts",
    "components/icons/Activity.tsx",
    "components/icons/Heart.tsx",
    "components/icons/Home.tsx",
    "components/icons/Moon.tsx",
    "components/icons/Settings.tsx",
    "components/icons/Star.tsx",
    "components/icons/Sun.tsx",
  ];

  for (const relPath of expected) {
    const fullPath = path.join(TEMPLATE_DIR, relPath);
    assert.ok(fs.existsSync(fullPath), `expected template file missing: ${relPath}`);
  }
});

test("react-native-bobuttons template: vendored bobuttons tarball is present", () => {
  const tarballPath = path.join(TEMPLATE_DIR, "vendor", "bobuttons-0.1.0.tgz");
  assert.ok(fs.existsSync(tarballPath), "vendor/bobuttons-0.1.0.tgz is missing from the template");
  const { size } = fs.statSync(tarballPath);
  assert.ok(size > 0, "vendored bobuttons tarball is empty");
});

test("react-native-bobuttons template: App.tsx wraps the tree in BobuttonsProvider with no TamaguiProvider", () => {
  const appSource = fs.readFileSync(path.join(TEMPLATE_DIR, "App.tsx"), "utf8");

  assert.match(
    appSource,
    /import\s*\{[^}]*\bBobuttonsProvider\b[^}]*\}\s*from\s*['"]bobuttons['"]/,
    "App.tsx must import BobuttonsProvider from bobuttons' public entry point",
  );
  assert.match(
    appSource,
    /<BobuttonsProvider[\s>]/,
    "App.tsx must render <BobuttonsProvider> wrapping the component tree",
  );
  assert.doesNotMatch(
    appSource,
    /TamaguiProvider/,
    "App.tsx must never add a second TamaguiProvider alongside BobuttonsProvider",
  );
});
