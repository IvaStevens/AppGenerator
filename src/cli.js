// Orchestrator. Order of operations is itself the security property:
//
//   Node floor check -> parse args -> resolve target -> validate name
//   (pure, zero I/O) -> derive + re-validate Android identifiers ->
//   containment -> atomic acquire -> install signal handlers -> scaffold
//   -> install phase 1 -> install phase 2 -> print next steps.
//
// Everything that can exit 2 (usage error) happens BEFORE acquireTargetDir,
// so an unknown --target, an invalid name, or an unrescuable derived
// identifier writes nothing to disk.
//
// Every typed error (errors.js) is mapped to its fixed exit code and a
// message on stderr in exactly one place: the catch block at the bottom of
// run(). Cleanup runs for every failure AFTER acquisition (scaffold/install/
// signal) and never for a usage (2) or target (3) failure, because nothing
// was written in those cases.

import { parseArgs } from "node:util";
import { validateAppName } from "./validate-app-name.js";
import { acquireTargetDir } from "./target-dir.js";
import { scaffold } from "./scaffold.js";
import { runInstall } from "./install.js";
import { cleanup } from "./cleanup.js";
import { AppGeneratorError, usageError } from "./errors.js";
import { resolveTarget, listTargets, DEFAULT_TARGET_ID } from "./targets.js";

// The single global Node floor across every target (AC13): currently the
// Electron template's own requirement. react-native@0.83.10 (used by the
// react-native-android target) only needs Node >=20.19.4, so it does not
// raise this floor; if a future target needs more than 22.12.0, this
// constant - and both templates' READMEs - must be raised together, and
// the justification below updated to name the new binding constraint. It
// must never be lowered.
export const MIN_NODE_VERSION = [22, 12, 0];

/**
 * Pure helper, exported so it is unit-testable against synthetic version
 * strings without spawning a different Node binary.
 * @param {string} versionString - e.g. "v22.20.0" or "22.20.0"
 * @param {[number, number, number]} floor
 * @returns {boolean} true if versionString >= floor
 */
export function satisfiesNodeFloor(versionString, floor = MIN_NODE_VERSION) {
  const cleaned = String(versionString).replace(/^v/, "");
  const parts = cleaned.split(".").map((p) => Number.parseInt(p, 10) || 0);
  for (let i = 0; i < 3; i++) {
    const have = parts[i] || 0;
    const want = floor[i] || 0;
    if (have > want) return true;
    if (have < want) return false;
  }
  return true; // exactly equal
}

function renderTargetList() {
  return listTargets()
    .map((t) => `  ${t.id}${t.id === DEFAULT_TARGET_ID ? " (default)" : ""}\n      ${t.summary}`)
    .join("\n");
}

// Built from the target registry (src/targets.js), not hand-maintained, so
// a target that exists but is not in this list is structurally impossible
// (AC11).
const HELP_TEXT = `Usage: appgenerator <app-name> [--target <id>] [--no-install]

Generates a new app into ./<app-name>.

Targets:
${renderTargetList()}

Options:
  --target <id>  Which target to generate. Defaults to "${DEFAULT_TARGET_ID}"
                 (never required - omitting it keeps today's behaviour).
  --no-install   Scaffold files only; skip npm ci and the Electron binary
                 front-load. The generated app's first "npm start" will
                 then need a manual "npm ci" and may need to download the
                 Electron binary.
  --help         Show this message.

Exit codes:
  0   success
  1   unexpected error
  2   usage, validation, or Node version too old
  3   target directory exists and is not usable (non-empty, a file, a symlink)
  4   scaffold (template copy) failure
  5   install failure (npm ci or the Electron binary front-load)
  130 interrupted by SIGINT
  143 interrupted by SIGTERM
`;

/**
 * @param {string[]} argv - process.argv.slice(2)
 * @param {{ cwd: string }} env - injected cwd (never process.cwd() directly)
 */
export async function run(argv, { cwd }) {
  if (!satisfiesNodeFloor(process.version)) {
    throw usageError(
      `appgenerator requires Node ${MIN_NODE_VERSION.join(".")} or newer ` +
        `(the max of both targets' floors - the Electron template's own ` +
        `>=22.12.0, which is currently stricter than react-native-android's ` +
        `>=20.19.4); found ${process.version}.`,
    );
  }

  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        "no-install": { type: "boolean", default: false },
        help: { type: "boolean", default: false },
        target: { type: "string", default: DEFAULT_TARGET_ID },
      },
    });
  } catch (err) {
    throw usageError(`Invalid arguments: ${err.message}`);
  }

  if (parsed.values.help) {
    process.stdout.write(HELP_TEXT);
    return;
  }

  const [appName, ...rest] = parsed.positionals;
  if (!appName) {
    throw usageError(`Missing required <app-name>.\n\n${HELP_TEXT}`);
  }
  if (rest.length > 0) {
    throw usageError(`Unexpected extra argument(s): ${rest.join(", ")}`);
  }

  // Resolved before name validation: a typo'd --target is a usage error
  // regardless of whether the app name happens to be valid, and resolving
  // it first keeps the order (and therefore the "write nothing on a usage
  // error" guarantee) the same shape as every other check below.
  const targetDef = resolveTarget(parsed.values.target);

  const nameCheck = validateAppName(appName);
  if (!nameCheck.ok) {
    throw usageError(nameCheck.reason);
  }

  // Derive this target's identifiers (e.g. the Android applicationId) and
  // re-validate them BEFORE acquiring the target directory, so a name
  // sanitisation genuinely cannot rescue (see src/android-identifier.js)
  // is a usage error (exit 2) with zero filesystem writes, never a
  // scaffold failure after the fact.
  const derived = targetDef.derive ? targetDef.derive(appName) : null;

  const install = !parsed.values["no-install"];

  // Nothing has been written to disk yet at this point.
  const acquisition = acquireTargetDir(appName, { cwd });

  let activeChild = null;
  let interrupted = null; // 'SIGINT' | 'SIGTERM' | null

  const onSignal = (signal) => {
    interrupted = signal;
    if (activeChild) {
      activeChild.kill(signal);
      // Bounded wait, then escalate. The child's own 'exit' handler in
      // install.js settles the in-flight promise either way.
      setTimeout(() => {
        if (activeChild) activeChild.kill("SIGKILL");
      }, 3000).unref();
    } else {
      // No child in flight (e.g. during scaffold, or in the gap between
      // phase 1 and phase 2 of install - install.js clears activeChild as
      // soon as each child settles): nothing to forward to, so unwind and
      // clean up immediately instead of waiting out the 3s SIGKILL timer
      // against a child that has already exited.
      finishInterrupted();
    }
  };

  let finished = false;
  function finishInterrupted() {
    if (finished) return;
    finished = true;
    cleanup(acquisition, { cwd });
    process.exitCode = interrupted === "SIGINT" ? 130 : 143;
  }

  process.on("SIGINT", onSignal);
  process.on("SIGTERM", onSignal);

  try {
    scaffold(acquisition.target, { appName, targetId: targetDef.id, derived });

    // A signal can land between scaffold() returning and install starting
    // (JS is single-threaded, so it cannot land mid-scaffold itself).
    // Check before spawning anything into a directory cleanup may already
    // be removing.
    if (interrupted) {
      finishInterrupted();
      return;
    }

    if (install) {
      await runInstall(acquisition.target, {
        onChild: (child) => {
          activeChild = child;
        },
        isInterrupted: () => interrupted !== null,
      });
    }

    if (interrupted) {
      finishInterrupted();
      return;
    }

    process.stdout.write(
      targetDef.nextSteps(appName, acquisition.target, { install }),
    );
  } catch (err) {
    if (interrupted) {
      finishInterrupted();
      return;
    }
    // Anything that fails after acquisition means something was written;
    // clean it up before propagating the original error.
    try {
      cleanup(acquisition, { cwd });
    } catch (cleanupErr) {
      process.stderr.write(`(cleanup also failed: ${cleanupErr.message})\n`);
    }
    throw err;
  } finally {
    process.off("SIGINT", onSignal);
    process.off("SIGTERM", onSignal);
  }
}

/**
 * Entry point used by bin/appgenerator.js. Maps any thrown error to its
 * exit code and a stderr message, in one place.
 */
export async function main(argv = process.argv.slice(2), cwd = process.cwd()) {
  try {
    await run(argv, { cwd });
    return process.exitCode || 0;
  } catch (err) {
    if (err instanceof AppGeneratorError) {
      process.stderr.write(`${err.message}\n`);
      return err.exitCode;
    }
    process.stderr.write(`Unexpected error: ${err.stack || err.message}\n`);
    return 1;
  }
}
