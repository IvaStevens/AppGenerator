import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BIN = path.join(__dirname, "..", "bin", "appgenerator.js");
const FAKE_NPM = path.join(__dirname, "fixtures", "fake-npm.js");

function mkTmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "appgen-signals-"));
}

async function waitFor(check, { timeoutMs = 5000, intervalMs = 25 } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (check()) return;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error("waitFor timed out");
}

function runCliBackground(args, { cwd, env = {} }) {
  const child = spawn(process.execPath, [BIN, ...args], {
    cwd,
    env: { ...process.env, APPGEN_NPM_BIN: FAKE_NPM, FAKE_NPM_MODE: "slow", ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stderr = "";
  child.stderr.on("data", (d) => (stderr += d));
  const exitPromise = new Promise((resolve) => {
    child.on("exit", (code, signal) => resolve({ code, signal }));
  });
  return { child, exitPromise, getStderr: () => stderr };
}

test("SIGINT during install: exit 130, child signalled, generator-created directory fully removed", async (t) => {
  const cwd = mkTmp();
  t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
  const target = path.join(cwd, "sigintapp");

  const { child, exitPromise } = runCliBackground(["sigintapp"], { cwd });

  await waitFor(() => fs.existsSync(path.join(target, "node_modules", "marker.txt")));
  child.kill("SIGINT");

  const { code } = await exitPromise;
  assert.equal(code, 130);
  assert.ok(!fs.existsSync(target));
});

test("SIGTERM during install: exit 143, generator-created directory fully removed", async (t) => {
  const cwd = mkTmp();
  t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
  const target = path.join(cwd, "sigtermapp");

  const { child, exitPromise } = runCliBackground(["sigtermapp"], { cwd });

  await waitFor(() => fs.existsSync(path.join(target, "node_modules", "marker.txt")));
  child.kill("SIGTERM");

  const { code } = await exitPromise;
  assert.equal(code, 143);
  assert.ok(!fs.existsSync(target));
});

test("SIGINT during install into a PRE-EXISTING directory leaves it exactly as found", async (t) => {
  const cwd = mkTmp();
  t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
  const target = path.join(cwd, "preexisting-sig");
  fs.mkdirSync(target);
  fs.mkdirSync(path.join(target, ".git"));

  const { child, exitPromise } = runCliBackground(["preexisting-sig"], { cwd });

  await waitFor(() => fs.existsSync(path.join(target, "node_modules", "marker.txt")));
  child.kill("SIGINT");

  const { code } = await exitPromise;
  assert.equal(code, 130);
  assert.ok(fs.existsSync(target));
  assert.deepEqual(fs.readdirSync(target), [".git"]);
});

test("a repeat SIGINT mid-cleanup neither crashes the process nor aborts the delete", async (t) => {
  const cwd = mkTmp();
  t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
  const target = path.join(cwd, "repeatsig");

  const { child, exitPromise } = runCliBackground(["repeatsig"], { cwd });

  await waitFor(() => fs.existsSync(path.join(target, "node_modules", "marker.txt")));
  // Pad node_modules slightly so cleanup takes long enough to overlap with
  // a second signal landing mid-delete.
  for (let i = 0; i < 50; i++) {
    fs.writeFileSync(path.join(target, "node_modules", `pad-${i}.bin`), Buffer.alloc(200000));
  }

  child.kill("SIGINT");
  child.kill("SIGINT");

  const { code } = await exitPromise;
  assert.equal(code, 130);
  assert.ok(!fs.existsSync(target));
});
