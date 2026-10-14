// Copies templates/electron-gluestack into the target directory, then
// rewrites the app name via exactly two JSON parse/set/stringify
// operations. No text substitution anywhere else - everything that needs
// the app name at runtime reads it dynamically (app.getName()).

import { cpSync, readFileSync, writeFileSync, renameSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { scaffoldError } from "./errors.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const TEMPLATE_ROOT = path.join(__dirname, "..", "templates", "electron-gluestack");

const SKIP_LIST = new Set(["node_modules", "dist"]);

/**
 * @param {string} target - absolute path to the already-acquired, empty target directory
 * @param {{ appName: string, templateRoot?: string }} opts
 */
export function scaffold(target, { appName, templateRoot = TEMPLATE_ROOT }) {
  try {
    cpSync(templateRoot, target, {
      recursive: true,
      force: false,
      errorOnExist: true,
      dereference: false,
      filter: (src) => {
        const base = path.basename(src);
        return !SKIP_LIST.has(base);
      },
    });
  } catch (err) {
    throw scaffoldError(`Failed to copy template into "${target}": ${err.message}`);
  }

  try {
    // _gitignore -> .gitignore (CRA convention: underscore-prefixed so
    // packaging tools cannot rename or swallow it before it is copied).
    const underscoreGitignore = path.join(target, "_gitignore");
    const dotGitignore = path.join(target, ".gitignore");
    if (existsSync(underscoreGitignore)) {
      renameSync(underscoreGitignore, dotGitignore);
    }

    rewriteJsonName(path.join(target, "package.json"), appName, (json) => {
      json.name = appName;
    });

    rewriteJsonName(path.join(target, "package-lock.json"), appName, (json) => {
      json.name = appName;
      if (json.packages && json.packages[""]) {
        json.packages[""].name = appName;
      }
    });
  } catch (err) {
    throw scaffoldError(`Failed to rewrite generated app manifest: ${err.message}`);
  }
}

function rewriteJsonName(filePath, appName, mutate) {
  const raw = readFileSync(filePath, "utf8");
  const json = JSON.parse(raw);
  mutate(json);
  // 2-space indent AND a trailing newline - dropping the newline was a
  // verified diff against a real npm ci-generated lockfile.
  writeFileSync(filePath, `${JSON.stringify(json, null, 2)}\n`, "utf8");
}
