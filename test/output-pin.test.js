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
