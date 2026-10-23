# AppGenerator

A `create-react-app`-style generator with two targets: an independent
Electron desktop app preloaded with [gluestack-ui](https://gluestack.io/)
(a temporary stand-in for a future in-house component library, and the
default target), and a React Native app with a working Android (Gradle)
project. Both are proofs of concept.

## Requirements

- **Linux only** for this proof of concept (macOS/Windows are unverified:
  `npm` is `npm.cmd` on Windows, the Electron template's `smoke` script
  uses POSIX env syntax, and the documented Android build command assumes
  the POSIX `gradlew` wrapper, not `gradlew.bat`).
- **Node `>=22.12.0`**, exactly - the maximum of every target's own floor,
  not a vague "LTS". `electron@44.7.1` declares `engines.node:
  ">=22.12.0"` and `vite@7.3.7` / `@vitejs/plugin-react@5.2.0` declare
  `engines.node: "^20.19.0 || >=22.12.0"` (the electron-gluestack target);
  `react-native@0.83.10` declares `engines.node: ">=20.19.4"` (the
  react-native-android target). Electron is currently the binding
  constraint for the whole generator - running it on an older Node would
  let it generate an app it cannot build. The generator checks this itself
  at startup and exits with code `2` on an older Node, because `engines`
  alone only warns. If a future target needs a higher floor than
  `22.12.0`, this number is raised (never lowered) in `package.json`,
  `src/cli.js`, and every affected template's README, naming the new
  binding constraint.

## Usage

```
node bin/appgenerator.js <app-name> [--target <id>] [--no-install]
```

- `<app-name>` must be a valid npm package name with no path separators,
  no `..`, no absolute paths, and no leading `.`/`_` (see
  `src/validate-app-name.js` for the exact rule). Rejected names write
  nothing to the filesystem. The same rule is used for both targets -
  `validate-app-name.js` is never tightened per target - so for the
  react-native-android target the generator additionally *derives* a
  legal Android identifier from the name (see "React Native Android
  target" below) rather than rejecting more names.
- `--target <id>` selects which target to generate. It is **never
  required**: omitting it keeps today's behaviour exactly (generates
  `electron-gluestack`). Run `--help` for the full, registry-generated
  list of target ids.
- By default the generator runs the full install (so the generated app's
  first start command works immediately afterward with no manual `npm`
  steps). Pass `--no-install` to scaffold files only; the README written
  into the generated app then documents the manual `npm ci` step. For
  electron-gluestack, the first start after that may additionally need to
  download the Electron binary (see "Electron binary download" below).
- Generating into a path that does not exist creates it. Generating into
  an existing, completely empty directory (or one containing only benign
  dotfiles - `.git`, `.DS_Store`, `Thumbs.db`) is accepted. Anything else,
  **including a directory whose only content is a `.gitignore`**, is
  refused with a clear message naming the path and exit code `3` - nothing
  is overwritten or deleted. (`.gitignore` is deliberately not treated as
  benign: scaffolding renames its own `_gitignore` template file to
  `.gitignore`, and a pre-existing one would otherwise be silently
  clobbered.)

The electron-gluestack app's start command is `npm start` (run from inside
the new app directory). The react-native-android app's commands are
`npm start` (Metro) plus `npm run android` or the Gradle build directly -
see "React Native Android target" below.

## Exit codes

| Code | Meaning |
| --- | --- |
| 0 | success |
| 1 | unexpected/internal error |
| 2 | usage, validation, or Node version too old (nothing written) |
| 3 | target directory exists and is not usable (non-empty, a file, or a symlink) |
| 4 | scaffold (template copy) failure |
| 5 | install failure (`npm ci` or the Electron binary front-load) |
| 130 | interrupted by SIGINT (Ctrl-C) |
| 143 | interrupted by SIGTERM |

On any failure after the target directory is acquired (codes 4, 5, 130,
143), the generator removes everything it itself wrote before exiting -
including anything `npm ci` created - and leaves a pre-existing directory
(and any benign dotfiles already in it, such as `.git`) exactly as it was
found. Retrying the same command after such a failure is expected to
succeed. Codes 2 and 3 never trigger cleanup, because nothing was
written - this includes the `.gitignore` case above: the generator fails
before touching the directory at all, so there is nothing to clean up.

**Not handled:** `SIGKILL` and power loss cannot be caught, so residue is
possible in that case; recovery is the same exit-3 message, naming the
path, telling you to remove it or pick another name. **Concurrent runs
with the same app name in the same directory are unsupported**: the loser
sees the directory as already (still-empty) existing and both runs write
into it; nothing *outside* the target is ever at risk, and the loser never
owns the directory, so it never deletes it. No lock file is used, because
a stale lock after a `SIGKILL` would block every future retry - worse than
the race it prevents.

## Testing

```
npm test
```

Runs the full suite offline, with `--no-install`-equivalent fixtures - no
network, no real `npm ci`, no Electron download. This is the default and
should always be run before changing anything.

```
npm run test:e2e
```

Opt-in (`APPGEN_E2E=1`). Generates a real app, runs the real `npm ci`,
front-loads the real Electron binary, builds it, and launches the
automated smoke check (`SMOKE_TEST=1`) against a real window - the actual
proof of AC1/AC2/AC3. Needs a display: `DISPLAY` or `WAYLAND_DISPLAY`, or
`xvfb-run` on PATH. If `APPGEN_E2E=1` is set and none of those is
available, the test **fails** (it does not silently skip), naming the
missing requirement. Manual fallback on a headless host:

```
xvfb-run -a npm run test:e2e
```

```
npm run test:e2e:android
```

Opt-in (`APPGEN_E2E=1`). Generates a real react-native-android app and
runs its Android debug build - the actual proof of AC8. Needs `java` on
`PATH` and `ANDROID_HOME` or `ANDROID_SDK_ROOT` set and containing
`platform-tools`, plus network access for the first build (see "React
Native Android target" below). If `APPGEN_E2E=1` is set and a prerequisite
is missing, the test **fails** (it does not silently skip), naming the
missing prerequisite. Manual fallback, equivalent to what the test runs:

```
node bin/appgenerator.js myapp --target react-native-android
cd myapp/android && ./gradlew assembleDebug
```

`npm run test:e2e` is unaffected by this and keeps pointing only at the
Electron proof, so it keeps working on a host that has a display and
nothing else - it does not start requiring a JDK or an Android SDK.

## Reproducibility and version pinning

Both templates pin exact versions for every direct dependency and ship a
committed `package-lock.json` installed with `npm ci` (never
`npm install`). This is what makes two apps generated weeks apart scaffold
identical dependency versions - the ticket's whole premise is one shared
look and feel, which a floating version would defeat.
`templates/*/package-lock.json` is the only real pin in both cases:
`@gluestack-ui/themed` declares floating `latest` transitive dependencies
(`@legendapp/motion`, `@expo/html-elements`), and the react-native-android
template's resolved graph contains 39 floating `*`/`latest` range
declarations of its own (`@types/node`, Babel/React/React Native peers,
etc.) that exact pins on the direct dependencies cannot constrain.

**Regenerating the electron-gluestack template lockfile** (only needed
when deliberately bumping a pinned version):

```
cd templates/electron-gluestack
rm -rf node_modules dist package-lock.json
npm install --no-audit --no-fund
npm run build && npm run smoke   # re-verify before committing
```

**Regenerating the react-native-android template lockfile:**

```
cd templates/react-native-android
rm -rf node_modules package-lock.json
npm install --no-audit --no-fund
npm audit   # re-check the advisory count below before committing
```

A test (`test/template-lockfile-sync.test.js`) fails fast, for every
target in the registry, if a template's declared dependencies and its
committed lockfile ever drift apart, instead of letting every generation
fail at `npm ci`.

## Electron binary download

`electron@44.7.1` has no `postinstall` script, so `npm ci` does **not**
download the ~283 MB Electron binary - by itself it would arrive lazily
the first time the app does `require('electron')`. To make the
install-on-generate reading of AC1 ("runnable with no manual steps")
actually true, the generator runs a second install phase after `npm ci`
that front-loads this binary (idempotent - a repeat run is a ~50 ms
no-op). If generation ran with `--no-install`, this download happens on
the first `npm start` instead.

The download is checksum-verified against a `checksums.json` file bundled
inside the npm tarball itself, which the committed lockfile pins by
integrity - so a poisoned or partial cache fails loudly rather than
silently. Behind a proxy or mirror, the usual Electron environment
variables are honoured (inherited from your shell, not configured by the
generator): `ELECTRON_MIRROR`, `electron_config_cache`,
`ELECTRON_OVERRIDE_DIST_PATH`, `force_no_cache`.

## React Native Android target

`--target react-native-android` generates a bare React Native 0.83.10
project that already contains a working `android/` Gradle project - not
one produced later by a separate `prebuild`/`eject` step. The template is
vendored from `@react-native-community/template@0.83.10` (MIT; see
`templates/react-native-android/THIRD-PARTY-NOTICE.md`), with its own
identity renamed so no generated app leaks it, and nothing else added:
no UI library, so a later layer (such as a future bobuttons-based target)
starts from a plain template.

### Application id

The generated app's Android namespace / `applicationId` is
`com.<sanitised-app-name>`, derived from the app name by the single
function in `src/android-identifier.js` - never a placeholder. Two apps
generated with different names get different `applicationId`s. The
sanitisation is deterministic but **not injective**: names that differ
only in separators collapse to the same identifier (for example `my-app`,
`my.app` and `my_app` all derive `com.my_app`), and a leading digit is
always prefixed the same way (so `1app` and a literal app named `a1app`
also collide). This is a known, documented property, not a bug - combined
with the shared debug keystore below, two colliding apps cannot be
installed side by side on the same device.

### Prerequisites for the Android build (not provisioned by the generator)

- JDK 17 or newer (required by Gradle 9.0 and Android Gradle Plugin
  8.12, both pinned in the template).
- The Android SDK, with `platform-tools` installed, and `ANDROID_HOME` (or
  `ANDROID_SDK_ROOT`) pointing at it.
- The SDK licences accepted (`sdkmanager --licenses`).
- Network access, for the first build only (see below).

Provisioning this toolchain is explicitly out of scope for the generator -
it is a documented prerequisite, the same way a display is a documented
prerequisite for the Electron e2e proof above.

### Building

```
cd <app-name>/android
./gradlew assembleDebug
```

produces `android/app/build/outputs/apk/debug/app-debug.apk` with **zero
edits** to the generated sources or config. **The first build needs
network access**: it downloads the Gradle 9.0.0 distribution and the
Maven artifacts for the Android Gradle Plugin, Kotlin and the React
Native Android runtime, then compiles native code with the NDK. The
generator front-loads **none** of that - only the npm/JS dependencies are
installed at generation time (`npm ci` against the template's committed
lockfile, exiting 0 with no manual intervention, exactly like
electron-gluestack). Front-loading Gradle/Maven artifacts would require
the Android SDK on the *generating* host, which is not a generator
prerequisite, and is out of scope. See `test/e2e/android-build.test.js`
and `npm run test:e2e:android` above for the automated proof of this
build, and its exact manual fallback.

### What does NOT run for this target

The Electron-specific install phase (front-loading the Electron binary)
does not run for this target: `src/install.js`'s existing
`existsSync(node_modules/electron/...)` guard degrades gracefully because
the react-native-android template has no Electron dependency, so `npm ci`
is already the complete JS install for this target (verified: the only
package in its resolved graph with an install script is the macOS-only,
optional `fsevents`).

### Dependency security (react-native-android)

`npm audit` on a freshly generated app reports **7 moderate advisories, 0
high, 0 critical**, via `@react-native-community/cli-platform-apple` /
`cli-platform-ios`, which still arrive transitively through
`@react-native-community/cli` even though the direct
`cli-platform-ios` dev dependency has been dropped (iOS is out of scope
for this ticket). `npm audit fix` must not be run against the template -
it would unpin versions and defeat reproducibility. Re-check this number
whenever the template lockfile is regenerated.

### Shared debug keystore

Every generated react-native-android app is signed for debug builds with
the same upstream Android debug keystore
(`android/app/debug.keystore`, password `android`), not a keystore unique
to that app. Combined with the applicationId collisions above, two
colliding apps are indistinguishable to Android's installer. Release
signing, keystores, and any registry publishing are out of scope.

## Dependency security (known, accepted)

`npm audit` on a freshly generated app reports **22 advisories - 15 high,
7 moderate, 0 critical** - and `--omit=dev` changes nothing (all are
declared as production dependencies of the dependency graph). The chain:
`@gluestack-ui/themed -> @legendapp/motion -> nativewind ->
react-native-css-interop -> tailwindcss/react-native -> metro ->
micromatch -> braces`. None of those packages is imported by the
placeholder screen, so none of them reaches the Vite-built renderer
bundle - they are build-time tooling that the dependency graph happens to
declare as runtime dependencies. Generated apps inherit this tree and have
no update path (see "No update/eject path" below). **`npm audit fix` must
not be run** against the template - it would unpin versions and defeat the
reproducibility goal above. Re-check these numbers whenever the template
lockfile is regenerated.

This is a known consequence of using `@gluestack-ui/themed@1.1.73` (the
legacy, pre-nativewind-CLI line - the only one that fits a Vite/Electron
renderer; see "Why this gluestack line" below), which is itself a
temporary stand-in for a future in-house component library. The
`src/ui/index.jsx` seam in every generated app is the intended exit route
when that library exists.

## Why this gluestack line, and the UI seam

gluestack now ships two materially different lines. The maintained v5 line
(`gluestack-ui` CLI, `@gluestack-ui/core`) is nativewind/Metro-only -
styling comes from `react-native-css-interop`, which ships only Babel and
Metro integrations and has no Vite or standalone PostCSS entry point, and
its CLI clones component source from git at generation time, which is not
version-pinnable. Neither fits this ticket. The legacy line -
`@gluestack-ui/themed` + `@gluestack-ui/config` + `@gluestack-style/react`
- uses runtime CSS-in-JS and works under Vite + `react-native-web` with no
bundler surgery beyond the three shims below, and is fully pinnable. It is
~13 months stale as a maintenance line; every generated app's UI code goes
through `src/ui/index.jsx` specifically so that fact is cheap to undo
later.

Three load-bearing Vite shims make this work and must not be "tidied
away" (each is commented in `templates/electron-gluestack/vite.config.mjs`
with the exact error it prevents):

1. `react-native -> react-native-web`, with `.web.*` extensions resolved
   first.
2. `@react-native/assets-registry/registry` aliased to a local no-op stub
   - the real npm package now re-exports from `react-native` itself and
   breaks the web build; do not add it as a dependency.
3. `buffer -> 'buffer/'`, for `react-native-svg`'s use of the Node
   `buffer` builtin.

## No shared state between generated apps

Each generated app owns its own `node_modules` (`npm ci`, never a
workspace, symlink, or `file:` link to the generator or to a sibling app).
Generating an app writes nothing inside this repo and nothing to this
repo's own `node_modules`; no generated file hardcodes another app's
name. The one thing that *is* shared is immutable, content-addressed,
checksum-verified package/binary caches on the host (`~/.npm`,
`~/.cache/electron`) - those are not app state and are unaffected by
deleting or regenerating any app.

Per-app `git init` is **not** implemented (left for a future decision).

## No update/eject path

Once generated, an app never tracks changes made to the template
afterward. There is no update command and no eject command. This matches
the ticket's scope: this generator proves the Electron target works, not
a long-lived update mechanism.

## Layout

```
bin/appgenerator.js             executable shim
src/cli.js                      argv parsing, orchestration, signal handling, exit codes
src/validate-app-name.js        pure name validation (zero I/O) - same rule for every target
src/target-dir.js               atomic target acquisition (ownership + snapshot)
src/targets.js                  the target registry - single source of truth per target
src/android-identifier.js       derives a legal Android applicationId from any accepted app name
src/name-bindings.js            allow-listed per-site name-binding executor (json / line / moveDir)
src/json-rewrite.js             the JSON parse/set/stringify primitive both targets' "json" bindings use
src/scaffold.js                 template copy + per-target dotfile renames + name bindings
src/install.js                  npm ci, then the Electron binary front-load (electron-gluestack only)
src/cleanup.js                   the only module that deletes anything
src/errors.js                    typed errors carrying fixed exit codes
templates/electron-gluestack/    the Electron + gluestack-ui template
templates/react-native-android/  the React Native + Android (Gradle) template
test/                             node:test suite (node --test, i.e. `npm test`)
docs/context/                     architect context for each ticket
```

## Name binding: a deliberate, allow-listed mechanism

APPGENERATOR-1 established a standing invariant: name binding is exactly
two JSON parse/set/stringify rewrites, never text substitution anywhere.
Android/Gradle/Kotlin source-directory renaming is not expressible as a
JSON rewrite, so this invariant has been **deliberately extended**, not
quietly broken, by `src/name-bindings.js`. There are exactly three
operation kinds - `json` (the original rewrite), `line` (one regex
anchored to one known line in one known file, which must match **exactly
once** or generation fails with exit `4` naming the file and the anchor),
and `moveDir` (one directory rename) - and deliberately no fourth
operation that replaces a token across files. electron-gluestack keeps
using the original `json`-only code path unchanged. The full rationale,
the complete react-native-android binding table, and the anti-pattern
findings this design avoids are recorded in
`docs/context/APPGENERATOR-3-add-react-native-android-app-generation.md`.
