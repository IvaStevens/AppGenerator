import { test } from "node:test";
import assert from "node:assert/strict";
import { androidSegment, applicationId } from "../src/android-identifier.js";
import { validateAppName } from "../src/validate-app-name.js";

// Required test-table rows (docs/context §5.4): the ones review named,
// plus the ones the rules imply.
const TABLE = [
  ["my-app", "my_app"],
  ["1app", "a1app"],
  ["a.b", "a_b"],
  ["my.app_name", "my_app_name"],
  ["a", "a"],
  ["class", "class_"],
  ["in", "in_"],
  ["myapp2", "myapp2"],
];

for (const [input, expected] of TABLE) {
  test(`androidSegment(${JSON.stringify(input)}) === ${JSON.stringify(expected)}`, () => {
    assert.equal(androidSegment(input), expected);
  });
}

test("applicationId prefixes com. onto the sanitised segment", () => {
  assert.equal(applicationId("my-app"), "com.my_app");
  assert.equal(applicationId("class"), "com.class_");
});

test("a 214-character name (the validator's max length) sanitises to a legal, length-214 segment", () => {
  const name = "x".repeat(214);
  const segment = androidSegment(name);
  assert.equal(segment.length, 214);
  assert.match(segment, /^[a-z][a-z0-9_]*$/);
  // com.<214 chars> = 218 characters total - comfortably inside Android's
  // practical package-name limits, but worth pinning rather than assuming.
  assert.equal(applicationId(name).length, 218);
});

test("KNOWN collision: 'my-app' and 'my.app' sanitise to the same segment", () => {
  // Deterministic but NOT injective: '-', '.' and '_' all map to '_', so
  // these two distinct, validator-accepted app names derive the same
  // Android identifier and therefore the same applicationId. Consequence:
  // the two generated apps share an applicationId and (because the
  // react-native-android template ships a single shared debug keystore)
  // cannot be installed side by side on one device. This is a documented,
  // accepted property - see README.md - not a defect to be "fixed" here.
  assert.equal(androidSegment("my-app"), androidSegment("my.app"));
  assert.equal(androidSegment("my-app"), androidSegment("my_app"));
});

test("two names that are NOT separator-variants of each other get different applicationIds", () => {
  assert.notEqual(applicationId("my-app"), applicationId("other-app"));
});

test("the post-sanitisation legality assertion is unreachable for any name the validator accepts (fuzz)", () => {
  // Every character the validator's alphabet can produce: [a-z0-9._-].
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789._-";
  const RESERVED = new Set([
    "class", "in", "true", "false", "null", "var", "object", "val", "fun",
    "as", "is", "when", "do", "if", "for", "while",
  ]);

  for (let i = 0; i < 500; i++) {
    // Deterministic pseudo-random-ish generation without a dependency:
    // build a short validator-legal name from the alphabet, seeded by i.
    let name = alphabet[i % alphabet.length];
    const len = 1 + (i % 12);
    for (let j = 0; j < len; j++) {
      name += alphabet[(i * 31 + j * 7) % alphabet.length];
    }
    // Only exercise names the validator actually accepts (it forbids a
    // leading '.' or '_', "..", etc.) - androidSegment's contract is only
    // ever invoked on validator-accepted names.
    const check = validateAppName(name);
    if (!check.ok) continue;

    const segment = androidSegment(name);
    assert.match(segment, /^[a-z][a-z0-9_]*$/, `segment for "${name}" was "${segment}"`);
    assert.ok(!RESERVED.has(segment), `segment for "${name}" was a reserved word: "${segment}"`);
  }
});

test("the provably-empty rejection set: no name this suite or the validator's alphabet can produce is rejected", () => {
  // androidSegment never throws for any name validate-app-name.js accepts
  // today (see module header for the proof: step 2 maps the whole
  // alphabet into [a-z0-9_], the first character is always [a-z0-9], and
  // step 3 makes it a letter if it was a digit - so the result is never
  // empty and always matches /^[a-z][a-z0-9_]*$/). This test documents
  // that the enumerated "cannot rescue" set (AC4) is empty.
  const sampleNames = ["a", "1", "my-app", "1app", "class", "a.b.c", "z".repeat(214)];
  for (const name of sampleNames) {
    assert.doesNotThrow(() => androidSegment(name), `unexpectedly threw for "${name}"`);
  }
});
