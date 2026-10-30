// Offline guard against the failure mode that breaks every single
// generation: a template's declared dependencies drifting out of sync
// with its committed lockfile. Catches that in milliseconds instead of at
// every user's `npm ci`. Iterates every target in the registry (AC10) -
// electron-gluestack's assertions keep identical semantics to before this
// ticket; react-native-android is new.
//
// APPGENERATOR-2 (pr3): react-native-bobuttons declares `bobuttons` as a
// `vendoredDeps` entry (src/targets.js) - a `file:` tarball spec, not an
// exact semver range. Every assertion below branches on that per-target
// list so electron-gluestack and react-native-android stay covered by
// EXACTLY the same checks as before (never relaxed globally), while a
// vendored dep gets a STRICTER check: a relative, non-escaping `file:...
// tgz` spec that matches the committed lockfile's root range and
// `resolved` field, references a tarball that actually exists in the
// template, and carries an `sha512-` integrity hash.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { listTargets, resolveTarget } from "../src/targets.js";

for (const { id } of listTargets()) {
  const TEMPLATE_ROOT = resolveTarget(id).templateDir;
  const vendored = new Set(resolveTarget(id).vendoredDeps ?? []);

  test(`[${id}] every declared dependency and devDependency is pinned in the committed lockfile at the exact declared version`, () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(TEMPLATE_ROOT, "package.json"), "utf8"));
    const lock = JSON.parse(fs.readFileSync(path.join(TEMPLATE_ROOT, "package-lock.json"), "utf8"));

    const rootPkg = lock.packages[""];
    assert.ok(rootPkg, "lockfile has no root packages[''] entry");

    const declared = { ...pkg.dependencies, ...pkg.devDependencies };

    for (const [name, version] of Object.entries(declared)) {
      const lockedRange =
        (rootPkg.dependencies && rootPkg.dependencies[name]) ||
        (rootPkg.devDependencies && rootPkg.devDependencies[name]);
      assert.equal(
        lockedRange,
        version,
        `package.json declares ${name}@${version} but the lockfile's root entry says ${lockedRange}`,
      );

      const resolvedEntry = lock.packages[`node_modules/${name}`];
      assert.ok(resolvedEntry, `lockfile has no node_modules/${name} entry`);

      if (vendored.has(name)) {
        // A `file:` spec: the lockfile's own `version` field is the
        // VENDORED PACKAGE's own semver (e.g. "0.1.0"), not the spec, so
        // the sync check is on `resolved` plus a real integrity hash.
        assert.equal(
          resolvedEntry.resolved,
          version,
          `lockfile resolves ${name} to "${resolvedEntry.resolved}", expected exactly "${version}"`,
        );
        assert.ok(
          typeof resolvedEntry.integrity === "string" && resolvedEntry.integrity.startsWith("sha512-"),
          `lockfile entry for vendored dep "${name}" must carry an sha512- integrity hash`,
        );

        const tarballRelPath = version.slice("file:".length);
        assert.ok(
          fs.existsSync(path.join(TEMPLATE_ROOT, tarballRelPath)),
          `vendored dep "${name}" declares "${version}" but "${tarballRelPath}" does not exist in the template`,
        );
        continue;
      }

      assert.equal(
        resolvedEntry.version,
        version,
        `lockfile resolves ${name} to ${resolvedEntry.version}, expected exactly ${version}`,
      );
    }
  });

  test(`[${id}] package.json declares exact versions (no ranges) for every direct dependency, and only declared vendoredDeps use a file: spec`, () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(TEMPLATE_ROOT, "package.json"), "utf8"));
    const declared = { ...pkg.dependencies, ...pkg.devDependencies };
    for (const [name, version] of Object.entries(declared)) {
      if (vendored.has(name)) {
        // Stricter than an exact-version pin, not weaker: relative (never
        // absolute, never escaping the template root), a committed
        // tarball, and nothing npm would treat as a workspace/git/link
        // spec.
        assert.match(
          version,
          /^file:[^/\\][^\n]*\.tgz$/,
          `vendored dep "${name}" must be a relative "file:...tgz" spec, got "${version}"`,
        );
        assert.ok(
          !version.includes(".."),
          `vendored dep "${name}"'s spec "${version}" must not escape the template root`,
        );
        continue;
      }

      assert.ok(
        /^\d+\.\d+\.\d+$/.test(version),
        `${name} is declared as "${version}", which is not an exact pinned version`,
      );
      // Negative guard (APPGENERATOR-2 pr3): the vendoredDeps exception
      // must never silently cover an undeclared dependency.
      assert.ok(
        !/^(file:|link:|git\+|workspace:)/.test(version) && !path.isAbsolute(version),
        `${name} is declared as "${version}" but is not listed in this target's vendoredDeps`,
      );
    }
  });
}
