// Copies a target's template into the target directory, then runs that
// target's name bindings (src/name-bindings.js) - exactly two JSON
// parse/set/stringify rewrites for electron-gluestack (unchanged, AC12),
// the full §5.3 binding table for react-native-android (AC6). Per-target
// configuration (template root, cpSync skip list, dotfile renames,
// bindings) lives in the registry (src/targets.js), never as an if/else
// on target id here - this module stays generic.
//
// TEMPLATE_ROOT and the scaffold(target, { appName }) signature are kept
// exactly as they were before this ticket, because existing tests import
// and call them that way; targetId and derived are new, optional, and
// default to the electron-gluestack target with no derived identifiers.

import { cpSync, renameSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { scaffoldError, AppGeneratorError } from "./errors.js";
import { resolveTarget, DEFAULT_TARGET_ID } from "./targets.js";
import { applyBindings } from "./name-bindings.js";
import { rewriteJsonName } from "./json-rewrite.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const TEMPLATE_ROOT = path.join(__dirname, "..", "templates", "electron-gluestack");

// Re-exported so name-bindings.js's "json" binding operation and the
// electron-gluestack target's two inline rewrites are provably the SAME
// function, not two implementations that happen to agree today.
export { rewriteJsonName };

/**
 * @param {string} target - absolute path to the already-acquired, empty target directory
 * @param {{ appName: string, targetId?: string, derived?: object }} opts
 */
export function scaffold(target, { appName, targetId = DEFAULT_TARGET_ID, derived = null }) {
  const targetDef = resolveTarget(targetId);
  const skipSet = new Set(targetDef.skip);

  try {
    cpSync(targetDef.templateDir, target, {
      recursive: true,
      force: false,
      errorOnExist: true,
      dereference: false,
      filter: (src) => {
        const base = path.basename(src);
        return !skipSet.has(base);
      },
    });
  } catch (err) {
    throw scaffoldError(`Failed to copy template into "${target}": ${err.message}`);
  }

  try {
    // Underscore -> dot dotfile renames (generalises the electron target's
    // original single _gitignore -> .gitignore rename, existsSync-guarded
    // exactly as before so a template that lacks one of these is a no-op,
    // not a failure).
    for (const dotfile of targetDef.dotfiles) {
      const from = path.join(target, dotfile);
      const to = path.join(target, `.${dotfile.slice(1)}`);
      if (existsSync(from)) {
        renameSync(from, to);
      }
    }

    applyBindings(target, targetDef.bindings, { appName, derived });
  } catch (err) {
    if (err instanceof AppGeneratorError) {
      // Already a typed, correctly-coded error from name-bindings.js
      // (scaffoldError, exit 4) - propagate as-is rather than re-wrapping.
      throw err;
    }
    throw scaffoldError(`Failed to rewrite generated app manifest: ${err.message}`);
  }
}
