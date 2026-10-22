import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { scaffold, TEMPLATE_ROOT } from "../src/scaffold.js";

function mkTmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "appgen-scaffold-"));
}

function listAllFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...listAllFiles(p));
    } else {
      out.push(p);
    }
  }
  return out;
}

test("copies the expected file tree and renames _gitignore", (t) => {
  const cwd = mkTmp();
  t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
  const target = path.join(cwd, "myapp");
  fs.mkdirSync(target);

  scaffold(target, { appName: "myapp" });

  assert.ok(fs.existsSync(path.join(target, "package.json")));
  assert.ok(fs.existsSync(path.join(target, "package-lock.json")));
  assert.ok(fs.existsSync(path.join(target, ".gitignore")));
  assert.ok(!fs.existsSync(path.join(target, "_gitignore")));
  assert.ok(fs.existsSync(path.join(target, "index.html")));
  assert.ok(fs.existsSync(path.join(target, "electron", "main.cjs")));
  assert.ok(fs.existsSync(path.join(target, "src", "App.jsx")));
  assert.ok(fs.existsSync(path.join(target, "src", "ui", "index.jsx")));
});

test("rewrites the app name in package.json and package-lock.json with a trailing newline", (t) => {
  const cwd = mkTmp();
  t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
  const target = path.join(cwd, "cool-app");
  fs.mkdirSync(target);

  scaffold(target, { appName: "cool-app" });

  const pkgRaw = fs.readFileSync(path.join(target, "package.json"), "utf8");
  const pkg = JSON.parse(pkgRaw);
  assert.equal(pkg.name, "cool-app");
  assert.ok(pkgRaw.endsWith("\n"));

  const lockRaw = fs.readFileSync(path.join(target, "package-lock.json"), "utf8");
  const lock = JSON.parse(lockRaw);
  assert.equal(lock.name, "cool-app");
  assert.equal(lock.packages[""].name, "cool-app");
  assert.ok(lockRaw.endsWith("\n"));
});

test("the app name appears in exactly package.json and package-lock.json, nowhere else; template identity leaks nowhere", (t) => {
  const cwd = mkTmp();
  t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
  const target = path.join(cwd, "distinctivename123");
  fs.mkdirSync(target);

  scaffold(target, { appName: "distinctivename123" });

  const files = listAllFiles(target);
  const filesContainingName = [];
  const filesContainingTemplateName = [];
  for (const f of files) {
    const content = fs.readFileSync(f, "utf8");
    if (content.includes("distinctivename123")) filesContainingName.push(f);
    if (content.includes("appgen-template")) filesContainingTemplateName.push(f);
  }

  assert.deepEqual(
    filesContainingName.sort(),
    [path.join(target, "package.json"), path.join(target, "package-lock.json")].sort(),
  );
  assert.deepEqual(filesContainingTemplateName, []);
});

test("index.html ships no <title> element", (t) => {
  const cwd = mkTmp();
  t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
  const target = path.join(cwd, "app");
  fs.mkdirSync(target);

  scaffold(target, { appName: "app" });

  const html = fs.readFileSync(path.join(target, "index.html"), "utf8");
  assert.ok(!html.includes("<title"));
});

test("node_modules and dist are never copied even when present in the template", (t) => {
  const cwd = mkTmp();
  t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
  const target = path.join(cwd, "app");
  fs.mkdirSync(target);

  const hasTemplateNodeModules = fs.existsSync(path.join(TEMPLATE_ROOT, "node_modules"));
  const hasTemplateDist = fs.existsSync(path.join(TEMPLATE_ROOT, "dist"));

  scaffold(target, { appName: "app" });

  assert.ok(!fs.existsSync(path.join(target, "node_modules")));
  assert.ok(!fs.existsSync(path.join(target, "dist")));
  // document what was true of the template at test time, for diagnostics
  t.diagnostic(
    `template had node_modules=${hasTemplateNodeModules} dist=${hasTemplateDist}`,
  );
});

test("the template tree contains no symlinks", () => {
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name === "dist") continue;
      const p = path.join(dir, entry.name);
      const st = fs.lstatSync(p);
      assert.ok(!st.isSymbolicLink(), `unexpected symlink: ${p}`);
      if (st.isDirectory()) walk(p);
    }
  }
  walk(TEMPLATE_ROOT);
});

test("the template directory is byte-identical after a run", (t) => {
  const cwd = mkTmp();
  t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
  const target = path.join(cwd, "app");
  fs.mkdirSync(target);

  function snapshotTree(dir) {
    const out = {};
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name === "dist") continue;
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        out[entry.name] = snapshotTree(p);
      } else {
        out[entry.name] = fs.readFileSync(p, "utf8");
      }
    }
    return out;
  }

  const before = snapshotTree(TEMPLATE_ROOT);
  scaffold(target, { appName: "app" });
  const after = snapshotTree(TEMPLATE_ROOT);

  assert.deepEqual(after, before);
});

test("no generated file outside src/ui imports @gluestack-ui/* or react-native* directly", (t) => {
  const cwd = mkTmp();
  t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
  const target = path.join(cwd, "app");
  fs.mkdirSync(target);
  scaffold(target, { appName: "app" });

  const srcDir = path.join(target, "src");
  const offenders = [];
  for (const f of listAllFiles(srcDir)) {
    if (f.startsWith(path.join(srcDir, "ui"))) continue;
    if (!/\.(jsx?|tsx?)$/.test(f)) continue;
    const content = fs.readFileSync(f, "utf8");
    if (/from\s+["']@gluestack-ui\//.test(content) || /from\s+["']react-native["']/.test(content)) {
      offenders.push(f);
    }
  }
  assert.deepEqual(offenders, []);
});
