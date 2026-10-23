# AppGenerator

A `create-react-app`-style command-line generator. Give it a name and a
target, and it writes a new, independent app with its dependencies
installed and ready to run. Every generated app owns its own
`node_modules` and shares no state with the generator or with other apps.

## Targets

| Target | What it generates |
| --- | --- |
| `electron-gluestack` (default) | An Electron desktop app with [gluestack-ui](https://gluestack.io/), built with Vite and React. |
| `react-native-android` | A bare React Native app with a working `android/` Gradle project. |

Run `--help` for the current list of target ids.

## Requirements

- Linux (macOS and Windows are unverified).
- Node `>=22.12.0`. The generator checks this at startup and exits with
  code `2` on an older Node.

## Usage

```
node bin/appgenerator.js <app-name> [--target <id>] [--no-install]
```

- `<app-name>` must be a valid npm package name. See
  `src/validate-app-name.js` for the exact rule. Invalid names write
  nothing.
- `--target <id>` picks the target. Omit it to generate
  `electron-gluestack`.
- By default the generator runs the install, so the app is ready to run.
  Pass `--no-install` to write the files only; the generated app's README
  then documents the manual `npm ci` step.
- The target directory must not exist or must be empty (a lone `.git` is
  fine). Anything else is refused and nothing is overwritten.

Then, from inside the new app:

- `electron-gluestack`: `npm start`
- `react-native-android`: `npm start` for Metro, then `npm run android`,
  or build directly with Gradle (see below).

## React Native Android

The generated app's `applicationId` is `com.<app-name>`, with characters
that are illegal in an Android package segment mapped to `_`. Names that
differ only in separators (such as `my-app` and `my_app`) therefore get
the same id.

Building the Android app needs, in addition to Node:

- JDK 17 or newer
- the Android SDK with `platform-tools`, and `ANDROID_HOME` (or
  `ANDROID_SDK_ROOT`) set
- accepted SDK licences (`sdkmanager --licenses`)
- network access for the first build, which downloads the Gradle
  distribution and Maven artifacts. The generator does not pre-fetch them.

```
cd <app-name>/android
./gradlew assembleDebug
```

## Exit codes

| Code | Meaning |
| --- | --- |
| 0 | success |
| 1 | unexpected/internal error |
| 2 | usage, validation, or Node version too old (nothing written) |
| 3 | target directory exists and is not usable |
| 4 | scaffold (template copy) failure |
| 5 | install failure |
| 130 | interrupted by SIGINT |
| 143 | interrupted by SIGTERM |

After a failure from code 4 onward, the generator removes everything it
wrote and leaves a pre-existing directory as it found it, so retrying the
same command is safe.

## Development

```
npm test
```

Runs the suite offline: no network, no real install. Two opt-in end-to-end
tests (set `APPGEN_E2E=1`) generate real apps and exercise them. Each one
fails, rather than skips, if its prerequisites are missing:

```
npm run test:e2e            # Electron: needs a display (or xvfb-run)
npm run test:e2e:android    # Android: needs a JDK and the Android SDK
```

Each template pins exact dependency versions and commits a
`package-lock.json`, installed with `npm ci`. When deliberately bumping a
version, regenerate that template's lockfile and re-run its checks.
`test/template-lockfile-sync.test.js` fails if a template and its
lockfile drift apart.

## Layout

```
bin/appgenerator.js              executable shim
src/cli.js                       argument parsing, orchestration, exit codes
src/targets.js                   the target registry
src/validate-app-name.js         app name validation
src/android-identifier.js        derives an Android applicationId from the app name
src/target-dir.js                target directory checks
src/scaffold.js                  template copy and name binding
src/name-bindings.js             the allow-listed per-file name edits
src/json-rewrite.js              JSON name rewrite
src/install.js                   dependency install
src/cleanup.js                   removal of partial output on failure
src/errors.js                    typed errors and exit codes
templates/electron-gluestack/    Electron template
templates/react-native-android/  React Native Android template
test/                            node:test suite
```
