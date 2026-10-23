// The allow-listed per-site name-binding executor (AC6). This is a
// deliberate, documented extension of APPGENERATOR-1's standing invariant
// ("exactly two JSON parse/set/stringify rewrites, no text substitution
// anywhere" - docs/context §3 finding 6, study guide §4). That invariant
// did not cover Gradle/manifest/source-directory renaming, so this module
// extends it in a structured, allow-listed way rather than quietly
// breaking it: see docs/context/APPGENERATOR-3-add-react-native-android-app-generation.md
// §5.3 for the full rationale and the binding table this executes.
//
// Exactly THREE operation kinds, and deliberately no fourth kind that
// replaces a token across files:
//
//   - "json": delegates to the existing rewriteJsonName (parse, set,
//     stringify, 2-space indent, trailing newline) - the same function
//     the electron-gluestack target has always used.
//   - "line": one regex anchored to one known line in one known file. The
//     match count MUST equal exactly 1 (zero means the anchor rotted and
//     the template's own identity would leak silently; two-plus means the
//     edit is ambiguous) or this throws scaffoldError (exit 4) naming the
//     file and the anchor. The replacement is inserted via a FUNCTION
//     replacer, never a replacement string, so "$&"-class patterns in the
//     value can never be interpreted as regex replacement syntax.
//   - "moveDir": one directory rename.
//
// Every resolved path (including moveDir's destination) is asserted to
// stay inside the acquired target directory before it is touched - the
// same defence-in-depth convention target-dir.js and cleanup.js already
// use, applied here because a derived identifier (src/android-identifier.js)
// flows into a filesystem path (the Kotlin package directory).

import { readFileSync, writeFileSync, renameSync, existsSync } from "node:fs";
import path from "node:path";
import { scaffoldError } from "./errors.js";
import { rewriteJsonName } from "./json-rewrite.js";

function assertInside(target, resolvedPath, label) {
  const rel = path.relative(target, resolvedPath);
  if (rel === "" || rel.startsWith("..") || path.isAbsolute(rel)) {
    throw scaffoldError(
      `Refusing name binding "${label}": resolved path "${resolvedPath}" escapes target "${target}".`,
    );
  }
}

function applyJsonBinding(target, binding, ctx) {
  const filePath = path.join(target, binding.file);
  assertInside(target, filePath, `json:${binding.file}`);
  rewriteJsonName(filePath, ctx.appName, (json) => binding.mutate(json, ctx));
}

function applyLineBinding(target, binding, ctx) {
  const filePath = path.join(target, binding.file);
  assertInside(target, filePath, `line:${binding.file}`);

  let raw;
  try {
    raw = readFileSync(filePath, "utf8");
  } catch (err) {
    throw scaffoldError(
      `Name binding "${binding.anchor}" could not read "${filePath}": ${err.message}`,
    );
  }

  const matches = raw.match(new RegExp(binding.anchor, "g"));
  const count = matches ? matches.length : 0;
  if (count !== 1) {
    throw scaffoldError(
      `Name binding anchor ${binding.anchor} matched ${count} time(s) in ` +
        `"${filePath}" (expected exactly 1). The template may have drifted ` +
        "from the committed binding table.",
    );
  }

  const value = binding.value(ctx);
  const rewritten = raw.replace(
    new RegExp(binding.anchor),
    // Function replacer only - never a replacement string - so no
    // "$&"-class token in `value` can be interpreted by String#replace.
    (fullMatch, ...groups) => binding.replace(fullMatch, value, groups),
  );
  writeFileSync(filePath, rewritten, "utf8");
}

function applyMoveDirBinding(target, binding, ctx) {
  const from = path.join(target, binding.from(ctx));
  const to = path.join(target, binding.to(ctx));
  assertInside(target, from, `moveDir:from:${binding.from(ctx)}`);
  assertInside(target, to, `moveDir:to:${binding.to(ctx)}`);

  if (!existsSync(from)) {
    throw scaffoldError(`Name binding moveDir source "${from}" does not exist.`);
  }
  try {
    renameSync(from, to);
  } catch (err) {
    throw scaffoldError(`Name binding moveDir "${from}" -> "${to}" failed: ${err.message}`);
  }
}

/**
 * Runs every binding in `bindings`, in order, against the already-copied
 * template tree at `target`.
 *
 * @param {string} target - absolute path to the acquired target directory
 * @param {Array<object>} bindings - binding descriptors (see src/targets.js)
 * @param {{ appName: string, derived?: object }} ctx
 */
export function applyBindings(target, bindings, ctx) {
  for (const binding of bindings) {
    if (binding.op === "json") {
      applyJsonBinding(target, binding, ctx);
    } else if (binding.op === "line") {
      applyLineBinding(target, binding, ctx);
    } else if (binding.op === "moveDir") {
      applyMoveDirBinding(target, binding, ctx);
    } else {
      // Allow-list violation: there is no fourth operation kind by
      // design (see module header). A new op must be added deliberately
      // here, not inferred.
      throw scaffoldError(`Unknown name-binding operation "${binding.op}".`);
    }
  }
}
