// The only module allowed to delete. Deliberately synchronous-only so the
// signal path (cli.js's SIGINT/SIGTERM handlers) cannot be cut short
// mid-delete by the event loop moving on.
//
// Snapshot-bounded: removes every top-level entry in the target directory
// that was NOT present in the acquisition snapshot (this is what removes
// npm ci's node_modules/ even when the directory pre-existed), and removes
// the directory itself only when we created it ourselves.
//
// Re-asserts containment immediately before every rmSync. Carries a
// re-entrancy guard because signal handlers are re-entrant (verified: a
// second Ctrl-C arrives mid-delete of a large tree) - repeat calls are
// ignored rather than racing the first cleanup.

import { rmSync, readdirSync, rmdirSync } from "node:fs";
import path from "node:path";

let cleaningUp = false;

/**
 * @param {{ target: string, createdByUs: boolean, snapshot: Set<string> }} acquisition
 * @param {{ cwd: string }} opts
 */
export function cleanup(acquisition, { cwd }) {
  if (cleaningUp) {
    // A repeat signal landed while we are already deleting. Ignore it
    // rather than re-entering: the in-flight cleanup will still finish.
    return;
  }
  cleaningUp = true;

  try {
    const { target, createdByUs, snapshot } = acquisition;

    const rel = path.relative(cwd, target);
    if (path.isAbsolute(rel) || rel.startsWith("..")) {
      // Should be unreachable (target-dir.js already asserted this), but
      // cleanup is the highest-blast-radius module in the repo, so it
      // re-checks before every delete rather than trusting the caller.
      throw new Error(`Refusing to clean up outside cwd: "${target}"`);
    }

    process.stderr.write(`cleaning up ${target}\n`);

    let entries;
    try {
      entries = readdirSync(target);
    } catch {
      // Target already gone (e.g. never existed because mkdir itself
      // failed before acquisition returned) - nothing to do.
      return;
    }

    for (const entry of entries) {
      if (snapshot.has(entry)) {
        continue; // present before we touched anything - never ours to remove
      }
      const entryPath = path.join(target, entry);
      const entryRel = path.relative(cwd, entryPath);
      if (path.isAbsolute(entryRel) || entryRel.startsWith("..")) {
        continue; // defence-in-depth, should be unreachable
      }
      rmSync(entryPath, { recursive: true, force: true });
    }

    if (createdByUs) {
      try {
        rmdirSync(target);
      } catch {
        // Directory not empty for some other reason, or already gone.
        // Non-fatal: the caller's original error/exit code still wins.
      }
    }
  } finally {
    cleaningUp = false;
  }
}
