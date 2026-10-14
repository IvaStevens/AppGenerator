// Pure, table-driven, zero I/O. A rejected name provably cannot write
// anything to the filesystem, because this module never touches fs.
//
// Rule (blocked decision 3, proposed default): the name must be a valid npm
// package name AND must not contain anything that could escape a single
// path segment under the generator's cwd. Path traversal is the
// security-relevant case; it is covered here, not left to discretion.

const NAME_PATTERN = /^[a-z0-9][a-z0-9._-]*$/;
const MAX_LENGTH = 214;

const RESERVED_NAMES = new Set([
  "node_modules",
  "favicon.ico",
  ".",
  "..",
]);

/**
 * @param {unknown} name
 * @returns {{ ok: true } | { ok: false, reason: string }}
 */
export function validateAppName(name) {
  if (typeof name !== "string" || name.length === 0) {
    return { ok: false, reason: "App name is required." };
  }

  if (name.length > MAX_LENGTH) {
    return {
      ok: false,
      reason: `App name must be ${MAX_LENGTH} characters or fewer.`,
    };
  }

  // Path traversal / escape checks, independent of the regex below so the
  // reason reported to the user is specific.
  if (name.includes("/") || name.includes("\\")) {
    return {
      ok: false,
      reason: `App name must not contain a path separator: "${name}"`,
    };
  }

  if (name === ".." || name.includes("..")) {
    return {
      ok: false,
      reason: `App name must not contain "..": "${name}"`,
    };
  }

  if (name.startsWith("/") || /^[a-zA-Z]:[\\/]/.test(name)) {
    return {
      ok: false,
      reason: `App name must not be an absolute path: "${name}"`,
    };
  }

  if (name.startsWith(".") || name.startsWith("_")) {
    return {
      ok: false,
      reason: `App name must not start with "." or "_": "${name}"`,
    };
  }

  if (RESERVED_NAMES.has(name)) {
    return { ok: false, reason: `"${name}" is a reserved name.` };
  }

  if (!NAME_PATTERN.test(name)) {
    return {
      ok: false,
      reason:
        `App name "${name}" is not a valid npm package name. ` +
        "Use lowercase letters, digits, '.', '_', and '-' only, " +
        "starting with a letter or digit.",
    };
  }

  return { ok: true };
}
