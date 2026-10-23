// The one documented, deterministic sanitisation function that turns any
// app name validate-app-name.js accepts (/^[a-z0-9][a-z0-9._-]*$/, <=214
// chars) into a legal Android applicationId segment. Pure, zero I/O - no
// filesystem, no process, nothing but string transforms - so it is
// unit-testable standalone (test/android-identifier.test.js) and safe to
// call before any target directory exists.
//
// validate-app-name.js is NOT touched by this ticket (AC4): we sanitise,
// we do not tighten. That means this function must turn names that are
// legal npm package names but illegal Java/Kotlin package segments (
// "my-app", "1app", "a.b", ...) into something a real Android build
// accepts, rather than rejecting them.
//
// Rules, applied in order:
//   1. lower-case (defensive: this function is public and independently
//      unit-tested, so it must not rely on validate-app-name.js having
//      already lower-cased anything).
//   2. map every character outside [a-z0-9_] to "_" - for the validator's
//      alphabet ([a-z0-9._-]) that is exactly "-" and ".".
//   3. if the first character is a digit, prefix "a" (a LETTER, not "_").
//      Android requires every applicationId segment to start with a
//      letter; a leading "_" is legal Java but not a legal applicationId
//      segment.
//   4. if the result is a Java or Kotlin reserved word, append "_"
//      (e.g. "class" -> "class_").
//   5. assert the result matches /^[a-z][a-z0-9_]*$/ and is not reserved.
//      This assertion is provably unreachable for any name the validator
//      accepts (step 2 maps the validator's whole alphabet into
//      [a-z0-9_], the first character is always [a-z0-9], step 3 makes it
//      a letter if it was a digit, so the result is never empty and
//      always matches the pattern) - see test/android-identifier.test.js
//      for the table that documents this. It is kept anyway, and raises a
//      usageError-shaped error here (callers map it to exit 2) BEFORE any
//      filesystem write, naming the app name and the illegal derived
//      value, so that a future loosening of validate-app-name.js degrades
//      to a clear exit 2 instead of a broken build or a path escape.
//
// NOT injective: "-", "." and "_" all collapse to "_", so "my-app",
// "my.app" and "my_app" all derive the same segment ("my_app"), and a
// leading digit always maps through the same "a" prefix, so e.g. "1app"
// and a literal app named "a1app" collide too. This is a known,
// documented, deterministic property (not a bug) - see
// test/android-identifier.test.js's collision-pair row and both READMEs.

import { usageError } from "./errors.js";

const JAVA_KOTLIN_RESERVED_WORDS = new Set([
  // Java reserved words (keywords + literals).
  "abstract", "assert", "boolean", "break", "byte", "case", "catch", "char",
  "class", "const", "continue", "default", "do", "double", "else", "enum",
  "extends", "final", "finally", "float", "for", "goto", "if", "implements",
  "import", "instanceof", "int", "interface", "long", "native", "new",
  "package", "private", "protected", "public", "return", "short", "static",
  "strictfp", "super", "switch", "synchronized", "this", "throw", "throws",
  "transient", "try", "void", "volatile", "while", "true", "false", "null",
  "var", "record", "yield", "permits", "sealed", "open", "module", "requires",
  "exports", "opens", "uses", "provides", "to", "with", "transitive",
  // Kotlin hard keywords not already covered above.
  "as", "fun", "in", "is", "object", "typealias", "typeof", "val", "when",
]);

const SEGMENT_PATTERN = /^[a-z][a-z0-9_]*$/;

/**
 * @param {string} appName - a name already accepted by validate-app-name.js
 * @returns {string} a legal Android applicationId / Java-Kotlin package segment
 */
export function androidSegment(appName) {
  let segment = String(appName).toLowerCase();
  segment = segment.replace(/[^a-z0-9_]/g, "_");

  if (/^[0-9]/.test(segment)) {
    segment = `a${segment}`;
  }

  if (JAVA_KOTLIN_RESERVED_WORDS.has(segment)) {
    segment = `${segment}_`;
  }

  if (!SEGMENT_PATTERN.test(segment) || JAVA_KOTLIN_RESERVED_WORDS.has(segment)) {
    // Provably unreachable for any name validate-app-name.js accepts today
    // (see module header and the test table) - kept as a guard against a
    // future loosening of name validation, raised before any filesystem
    // write and mapped to exit 2 by cli.js's single catch block.
    throw usageError(
      `App name "${appName}" sanitises to "${segment}", which is not a legal ` +
        `Android identifier segment. Choose a different app name.`,
    );
  }

  return segment;
}

/**
 * @param {string} appName - a name already accepted by validate-app-name.js
 * @returns {string} e.g. "com.my_app"
 */
export function applicationId(appName) {
  return `com.${androidSegment(appName)}`;
}
