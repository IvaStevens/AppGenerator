#!/usr/bin/env node
// Fixture for APPGEN_NPM_BIN. Lets cli.test.js and signals.test.js exercise
// install failure, signal, and retry paths in milliseconds, with no
// network and no real 774 MB install.
//
// Modes (via FAKE_NPM_MODE env var):
//   success  - create node_modules/ then exit 0 (default)
//   fail     - create node_modules/ then exit 1
//   slow     - create node_modules/ then idle until killed by a signal

import fs from "node:fs";
import path from "node:path";

const cwd = process.cwd();
const mode = process.env.FAKE_NPM_MODE || "success";

function createNodeModules() {
  const nm = path.join(cwd, "node_modules");
  fs.mkdirSync(nm, { recursive: true });
  fs.writeFileSync(path.join(nm, "marker.txt"), "created by fake-npm\n");
}

function handleSignal(signal) {
  process.exit(signal === "SIGTERM" ? 143 : 130);
}
process.on("SIGINT", () => handleSignal("SIGINT"));
process.on("SIGTERM", () => handleSignal("SIGTERM"));

createNodeModules();

if (mode === "fail") {
  process.exit(1);
} else if (mode === "slow") {
  // Idle until a signal arrives; node's default signal handling would
  // normally exit the process, but we install explicit handlers above so
  // this is a controlled, observable exit rather than being killed
  // silently before node_modules/marker.txt is flushed.
  setInterval(() => {}, 1000);
} else {
  process.exit(0);
}
