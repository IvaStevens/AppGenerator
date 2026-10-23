// The target registry: the single source of truth for every generator
// target. Per-target configuration lives here, never as an if/else on
// target id inside the generator core (APPGENERATOR-1 context §4.4: "keep
// generator core free of Electron specifics").
//
// A target cannot be generated without being listed here, and `--help`
// renders its list FROM this registry (via listTargets()/summary), which
// is what makes AC11 ("a second target must not be invisible in --help")
// structural rather than a documentation chore.
//
// electron-gluestack's entry reproduces today's behaviour exactly -
// same skip list, same single dotfile rename, same two JSON bindings
// (reached through name-bindings.js's "json" op instead of two inline
// calls, but landing on the exact same rewriteJsonName function), same
// next-steps text - so AC12's byte-level output pin is a meaningful proof
// that re-plumbing it through the registry changed nothing.

import path from "node:path";
import { fileURLToPath } from "node:url";
import { androidSegment, applicationId } from "./android-identifier.js";
import { usageError } from "./errors.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATES_ROOT = path.join(__dirname, "..", "templates");

export const DEFAULT_TARGET_ID = "electron-gluestack";

const electronGluestackTarget = {
  id: "electron-gluestack",
  summary: "Electron desktop app preloaded with gluestack-ui (default).",
  templateDir: path.join(TEMPLATES_ROOT, "electron-gluestack"),
  skip: ["node_modules", "dist"],
  dotfiles: ["_gitignore"],
  derive: null,
  bindings: [
    {
      op: "json",
      file: "package.json",
      mutate: (json, ctx) => {
        json.name = ctx.appName;
      },
    },
    {
      op: "json",
      file: "package-lock.json",
      mutate: (json, ctx) => {
        json.name = ctx.appName;
        if (json.packages && json.packages[""]) {
          json.packages[""].name = ctx.appName;
        }
      },
    },
  ],
  nextSteps: (appName, target, { install }) =>
    `\nCreated ${appName} at ${target}\n\n` +
    `Next steps:\n` +
    `  cd ${appName}\n` +
    (install ? `  npm start\n` : `  npm ci\n  npm start\n`),
};

// react-native-android's binding table (docs/context §5.3). Sites 7-9 run
// before site 11 (edit the Kotlin files in place, then move the
// directory) so each anchor is matched at a known path.
const RN_TEMPLATE_KOTLIN_PKG_DIR = "android/app/src/main/java/com/appgenrntemplate";

const reactNativeAndroidTarget = {
  id: "react-native-android",
  summary: "React Native app with a working Android (Gradle) project.",
  templateDir: path.join(TEMPLATES_ROOT, "react-native-android"),
  skip: ["node_modules", "dist", ".gradle", "build", ".cxx", ".kotlin", "local.properties"],
  dotfiles: ["_gitignore", "_eslintrc.js", "_prettierrc.js", "_watchmanconfig"],
  derive: (appName) => ({
    segment: androidSegment(appName),
    applicationId: applicationId(appName),
  }),
  bindings: [
    // Site 1
    {
      op: "json",
      file: "package.json",
      mutate: (json, ctx) => {
        json.name = ctx.appName;
      },
    },
    // Site 2
    {
      op: "json",
      file: "package-lock.json",
      mutate: (json, ctx) => {
        json.name = ctx.appName;
        if (json.packages && json.packages[""]) {
          json.packages[""].name = ctx.appName;
        }
      },
    },
    // Site 3 - the app NAME, not the applicationId: bare RN's app.json has
    // no applicationId key, and index.js reads `name` for
    // AppRegistry.registerComponent, so it must stay equal to
    // MainActivity.getMainComponentName() (site 8).
    {
      op: "json",
      file: "app.json",
      mutate: (json, ctx) => {
        json.name = ctx.appName;
        json.displayName = ctx.appName;
      },
    },
    // Site 4 - the sanitised segment, not the raw name: a Gradle
    // rootProject.name containing "." is an edge case nobody needs, and
    // reusing the one derived identifier keeps AC4's "Android identifiers
    // come from one function" property intact.
    {
      op: "line",
      file: "android/settings.gradle",
      anchor: /rootProject\.name = '[^']*'/.source,
      value: (ctx) => ctx.derived.segment,
      replace: (fullMatch, value) => `rootProject.name = '${value}'`,
    },
    // Site 5
    {
      op: "line",
      file: "android/app/build.gradle",
      anchor: /namespace "[^"]*"/.source,
      value: (ctx) => ctx.derived.applicationId,
      replace: (fullMatch, value) => `namespace "${value}"`,
    },
    // Site 6
    {
      op: "line",
      file: "android/app/build.gradle",
      anchor: /applicationId "[^"]*"/.source,
      value: (ctx) => ctx.derived.applicationId,
      replace: (fullMatch, value) => `applicationId "${value}"`,
    },
    // Site 7 (before the moveDir below)
    {
      op: "line",
      file: `${RN_TEMPLATE_KOTLIN_PKG_DIR}/MainActivity.kt`,
      anchor: /package com\.[a-z0-9_]+/.source,
      value: (ctx) => ctx.derived.applicationId,
      replace: (fullMatch, value) => `package ${value}`,
    },
    // Site 8 - must equal site 3 (app.json's name), pinned by a test.
    {
      op: "line",
      file: `${RN_TEMPLATE_KOTLIN_PKG_DIR}/MainActivity.kt`,
      anchor: /getMainComponentName\(\): String = "[^"]*"/.source,
      value: (ctx) => ctx.appName,
      replace: (fullMatch, value) => `getMainComponentName(): String = "${value}"`,
    },
    // Site 9
    {
      op: "line",
      file: `${RN_TEMPLATE_KOTLIN_PKG_DIR}/MainApplication.kt`,
      anchor: /package com\.[a-z0-9_]+/.source,
      value: (ctx) => ctx.derived.applicationId,
      replace: (fullMatch, value) => `package ${value}`,
    },
    // Site 10
    {
      op: "line",
      file: "android/app/src/main/res/values/strings.xml",
      anchor: /<string name="app_name">[^<]*<\/string>/.source,
      value: (ctx) => ctx.appName,
      replace: (fullMatch, value) => `<string name="app_name">${value}</string>`,
    },
    // Site 11 - moved last, so sites 7-9 above are matched at the known
    // template path.
    {
      op: "moveDir",
      from: () => RN_TEMPLATE_KOTLIN_PKG_DIR,
      to: (ctx) => `android/app/src/main/java/com/${ctx.derived.segment}`,
    },
  ],
  nextSteps: (appName, target, { install }) =>
    `\nCreated ${appName} at ${target}\n\n` +
    `Next steps:\n` +
    `  cd ${appName}\n` +
    (install ? "" : "  npm ci\n") +
    `  npm start\n` +
    `  npm run android   (needs a connected device/emulator; the first\n` +
    `                     Android build needs network - see README.md)\n`,
};

const TARGETS = [electronGluestackTarget, reactNativeAndroidTarget];
const TARGETS_BY_ID = new Map(TARGETS.map((t) => [t.id, t]));

/**
 * @returns {Array<{ id: string, summary: string }>}
 */
export function listTargets() {
  return TARGETS.map(({ id, summary }) => ({ id, summary }));
}

/**
 * @param {string} id
 * @returns {object} the target descriptor
 * @throws if id is not a known target id (caller maps to usageError/exit 2)
 */
export function resolveTarget(id) {
  const target = TARGETS_BY_ID.get(id);
  if (!target) {
    const validIds = TARGETS.map((t) => t.id).join(", ");
    throw usageError(`Unknown target "${id}". Valid targets: ${validIds}.`);
  }
  return target;
}
