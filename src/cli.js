// Orchestrator. Order of operations is itself the security property:
//
//   Node floor check -> parse args -> validate name (pure, zero I/O) ->
//   resolve + containment -> atomic acquire -> install signal handlers ->
//   scaffold -> install phase 1 -> install phase 2 -> print next steps.
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

const HELP_TEXT = `Usage: appgenerator <app-name> [--no-install]

Generates a new Electron app preloaded with gluestack-ui into ./<app-name>.

Options:
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
        `(this is the Electron template's own floor); found ${process.version}.`,
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

  const nameCheck = validateAppName(appName);
  if (!nameCheck.ok) {
    throw usageError(nameCheck.reason);
  }

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
    scaffold(acquisition.target, { appName });

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
      `\nCreated ${appName} at ${acquisition.target}\n\n` +
        `Next steps:\n` +
        `  cd ${appName}\n` +
        (install ? `  npm start\n` : `  npm ci\n  npm start\n`),
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
