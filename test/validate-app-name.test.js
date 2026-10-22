import { test } from "node:test";
import assert from "node:assert/strict";
import { validateAppName } from "../src/validate-app-name.js";

const VALID = ["my-app", "myapp2", "my.app_name", "a", "x".repeat(214)];

const INVALID = [
  ["MyApp", "uppercase"],
  ["my app", "space"],
  ["../evil", "traversal"],
  ["..", "bare dotdot"],
  ["/abs/path", "absolute path"],
  ["a/b", "forward-slash separator"],
  ["a\\b", "backslash separator"],
  [".hidden", "leading dot"],
  ["_private", "leading underscore"],
  ["node_modules", "reserved name"],
  ["x".repeat(215), "too long"],
  ["", "empty"],
  [undefined, "missing"],
  ["C:\\windows", "windows absolute path"],
];

for (const name of VALID) {
  test(`accepts valid name: ${JSON.stringify(name).slice(0, 40)}`, () => {
    const result = validateAppName(name);
    assert.equal(result.ok, true);
  });
}

for (const [name, label] of INVALID) {
  test(`rejects ${label}: ${JSON.stringify(name)}`, () => {
    const result = validateAppName(name);
    assert.equal(result.ok, false);
    assert.equal(typeof result.reason, "string");
    assert.ok(result.reason.length > 0);
  });
}
