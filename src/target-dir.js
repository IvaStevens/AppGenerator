// Atomic target acquisition.
//
// Ownership of the target comes from the atomic mkdir(recursive:false)
// itself: success means WE created it (snapshot = empty set); EEXIST means
// it pre-existed (snapshot = whatever benign entries are already there).
// Never infer ownership from a prior stat (TOCTOU), and never from
// mkdir(recursive:true), which does not throw on an existing directory and
// therefore cannot be the ownership signal (verified).
//
// EEXIST alone does not tell you what is there: it is returned identically
// for a directory, a file, and a symlink. lstat afterwards to distinguish
// them, and refuse anything that is not a plain directory.

import { mkdirSync, lstatSync, readdirSync } from "node:fs";
import path from "node:path";
import { targetError, usageError } from "./errors.js";

// .gitignore is deliberately NOT here: scaffold.js's _gitignore -> .gitignore
// rename is the only rename the scaffolder performs, so treating a
// pre-existing .gitignore as "benign" would mean silently overwriting (and,
// on a later failure, leaving the TEMPLATE's .gitignore behind in) a
// directory the generator does not own. A directory containing only a user
// .gitignore is therefore refused as non-empty, matching every other
// non-dotfile entry.
const BENIGN_DOTFILES = new Set([".git", ".DS_Store", "Thumbs.db"]);

/**
 * @param {string} appName - already validated by validate-app-name.js
 * @param {{ cwd: string }} opts - injected cwd, never process.cwd() directly
 * @returns {{ target: string, createdByUs: boolean, snapshot: Set<string> }}
 */
export function acquireTargetDir(appName, { cwd }) {
  const target = path.join(cwd, appName);

  // Defence-in-depth: re-assert containment even though validate-app-name.js
  // already rejects separators, "..", and absolute paths. This is the
  // guard cleanup.js also re-checks immediately before every rmSync.
  const rel = path.relative(cwd, target);
  if (path.isAbsolute(rel) || rel.startsWith("..")) {
    throw usageError(`Resolved target "${target}" escapes the working directory.`);
  }

  try {
    mkdirSync(target, { recursive: false });
    // We created it: nothing existed here a moment ago.
    return { target, createdByUs: true, snapshot: new Set() };
  } catch (err) {
    if (err.code === "ENOENT") {
      throw usageError(
        `Cannot create "${target}": parent directory does not exist.`,
      );
    }
    if (err.code !== "EEXIST") {
      throw err;
    }
  }

  // EEXIST: something is already there. lstat to find out what, because
  // EEXIST alone cannot distinguish a directory from a file or a symlink.
  let st;
  try {
    st = lstatSync(target);
  } catch (err) {
    throw targetError(`Cannot inspect existing path "${target}": ${err.message}`);
  }

  if (st.isSymbolicLink()) {
    throw targetError(`Refusing to generate into a symlink: "${target}"`);
  }

  if (!st.isDirectory()) {
    throw targetError(`Refusing to generate: "${target}" is not a directory.`);
  }

  const entries = readdirSync(target);
  const offending = entries.filter((entry) => !BENIGN_DOTFILES.has(entry));
  if (offending.length > 0) {
    throw targetError(
      `Directory "${target}" is not empty (found: ${offending.join(", ")}).`,
    );
  }

  return { target, createdByUs: false, snapshot: new Set(entries) };
}
