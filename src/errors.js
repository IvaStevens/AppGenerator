// Typed error carrying a fixed, documented exit code. Keeping "clear message
// + stable exit code" as one mechanism (instead of scattered process.exit
// calls) is what lets cli.js map every failure path to a single table.
//
// Exit codes (see README.md for the full table):
//   0   success
//   1   unexpected / internal error
//   2   usage, validation, or Node floor failure (nothing was written)
//   3   target directory not usable (non-empty, a file, or a symlink)
//   4   scaffold (template copy) failure
//   5   install failure (npm ci or the Electron binary front-load)
//   130 interrupted by SIGINT
//   143 interrupted by SIGTERM

export class AppGeneratorError extends Error {
  /**
   * @param {string} message
   * @param {number} exitCode
   */
  constructor(message, exitCode) {
    super(message);
    this.name = "AppGeneratorError";
    this.exitCode = exitCode;
  }
}

export function usageError(message) {
  return new AppGeneratorError(message, 2);
}

export function targetError(message) {
  return new AppGeneratorError(message, 3);
}

export function scaffoldError(message) {
  return new AppGeneratorError(message, 4);
}

export function installError(message) {
  return new AppGeneratorError(message, 5);
}
