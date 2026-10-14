// Two install phases.
//
// Phase 1: `npm ci` - honours the committed lockfile exactly (never `npm
// install`, which could silently resolve different versions).
//
// Phase 2: front-load the Electron binary. electron@44.7.1 has no
// postinstall script, so `npm ci` does not download it - the 283 MB binary
// otherwise arrives lazily at first `require('electron')`. Without this
// phase, "installed" would mean "still needs a download on first launch",
// which would make the install-on-generate reading of AC1 dishonest.
// Skipped silently if the template does not depend on Electron.
//
// Child processes are always spawned with an argv array and shell:false -
// never exec with string concatenation, because the app name is
// user-controlled input that ends up in `cwd`.
//
// Failure-mode map:
//   - 'error' event with code ENOENT -> npm/node not found on PATH
//   - 'error' event, other code      -> spawn failed for another reason
//   - exit with code !== 0           -> the process itself failed
//   - exit with code === null, signal set -> killed by a signal

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { installError } from "./errors.js";

/**
 * Resolves the npm binary to invoke. Honours APPGEN_NPM_BIN as a test seam
 * (and the future Windows npm.cmd hook) - this is internal, not a user
 * facing feature.
 */
function npmBin() {
  return process.env.APPGEN_NPM_BIN || "npm";
}

/**
 * Spawns one child process and resolves/rejects per the failure-mode map
 * above. Calls onChild(child) synchronously once spawn() returns so the
 * caller (cli.js) can track the in-flight child for signal forwarding.
 */
function runChild(command, args, { cwd, onChild }) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, shell: false, stdio: "inherit" });
    if (onChild) onChild(child);

    // Once this child has settled (either event below) it is no longer a
    // valid target for signal forwarding. Clearing the caller's reference
    // closes a gap where a Ctrl-C landing between phase 1 exiting and
    // phase 2 spawning would call .kill() on an already-dead child (a
    // no-op) instead of unwinding immediately - see isInterrupted() in
    // runInstall below.
    const clearChild = () => {
      if (onChild) onChild(null);
    };

    child.on("error", (err) => {
      clearChild();
      if (err.code === "ENOENT") {
        reject(
          installError(
            `"${command}" was not found on PATH; install Node/npm, or re-run with --no-install.`,
          ),
        );
        return;
      }
      reject(installError(`Failed to run "${command}": ${err.message}`));
    });

    child.on("exit", (code, signal) => {
      clearChild();
      if (signal) {
        reject(installError(`"${command}" was terminated by signal ${signal}.`));
        return;
      }
      if (code !== 0) {
        reject(installError(`"${command}" exited with code ${code}.`));
        return;
      }
      resolve();
    });
  });
}

/**
 * @param {string} target - absolute path to the generated app
 * @param {{
 *   onChild?: (child: import('node:child_process').ChildProcess | null) => void,
 *   isInterrupted?: () => boolean,
 * }} opts
 */
export async function runInstall(target, { onChild, isInterrupted } = {}) {
  await runChild(npmBin(), ["ci", "--no-audit", "--no-fund"], { cwd: target, onChild });

  // A signal can land in the gap between phase 1's child exiting (cleared
  // above) and phase 2's child spawning. Checking here, rather than only
  // after this function returns, avoids starting a ~283 MB download the
  // caller is already about to clean up.
  if (isInterrupted && isInterrupted()) {
    return;
  }

  const electronInstallScript = path.join(target, "node_modules", "electron", "install.js");
  if (!existsSync(electronInstallScript)) {
    return; // template does not depend on Electron (or it's a future, different target)
  }

  await runChild(process.execPath, [electronInstallScript], { cwd: target, onChild });
}
