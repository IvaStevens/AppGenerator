// The one JSON rewrite primitive: parse, mutate, stringify. This is the
// physical implementation APPGENERATOR-1 introduced as "exactly two JSON
// parse/set/stringify rewrites, no text substitution anywhere" (docs/context
// §3 finding 6). It is factored out of scaffold.js (rather than left
// inline there) purely so that src/name-bindings.js's "json" operation can
// reach the SAME function without scaffold.js and name-bindings.js
// importing each other in a cycle - both the electron-gluestack path and
// every "json" binding in the registry call this one function.

import { readFileSync, writeFileSync } from "node:fs";

/**
 * @param {string} filePath
 * @param {string} appName
 * @param {(json: object) => void} mutate
 */
export function rewriteJsonName(filePath, appName, mutate) {
  const raw = readFileSync(filePath, "utf8");
  const json = JSON.parse(raw);
  mutate(json);
  // 2-space indent AND a trailing newline - dropping the newline was a
  // verified diff against a real npm ci-generated lockfile.
  writeFileSync(filePath, `${JSON.stringify(json, null, 2)}\n`, "utf8");
}
