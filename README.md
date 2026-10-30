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
| `react-native-bobuttons` | A React Native app built entirely on bobuttons (a private, Tamagui-based component library) components, with a working `android/` Gradle project. See below. |

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
- `react-native-android` / `react-native-bobuttons`: `npm start` for
  Metro, then `npm run android`, or build directly with Gradle (see
  below).

## React Native Android

The generated app's `applicationId` is `com.<app-name>`, with characters
that are illegal in an Android package segment mapped to `_`. Names that
differ only in separators (such as `my-app` and `my_app`) therefore get
the same id. This applies to both `react-native-android` and
`react-native-bobuttons`: they share the same Android/Gradle scaffolding
on disk (see below) rather than each carrying their own copy.

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

## React Native bobuttons

`react-native-bobuttons` generates the same kind of app as
`react-native-android`, with its UI built entirely from bobuttons
components instead of bare React Native views. bobuttons is a private,
unpublished Tamagui-based component library; it is never installed from
a registry. Each generated app vendors its own copy of a
tarball packed from the Bobuttons project, referenced as a `file:`
dependency inside the generated app's own tree (so the app stays
self-contained even if the AppGenerator checkout is later moved or
removed):

- bobuttons `0.1.0`, packed from Bobuttons `main` commit
  `de3fe609ea34d5f7e0aab51b0a1fc8f81e89de98` on `2026-10-27` (UTC)
- Vendored at `vendor/bobuttons-0.1.0.tgz` in the template and in every
  generated app (370,432 bytes)
- Verified pairing: bobuttons `0.1.0` + react-native `0.83.10` + react
  `19.2.0` - `npm ci` installs with no unmet or invalid peer-dependency
  warning for bobuttons (its optional peer range is `react-native >=0.79
  <1.0`)

The same three provenance facts (version, source commit SHA, pack date)
are also recorded in the generated app's `package.json` under
`bobuttonsProvenance`. A generated bobuttons app must never add its own
`@tamagui/*` dependency - bobuttons bundles its own copy, and a second
one is exactly how the "can't find Tamagui configuration" runtime crash
happens. See `templates/react-native-bobuttons/README.md` (copied into
every generated app) for the full provenance record, the Jest
`transformIgnorePatterns` note, and the licence notices.

**Target shape**: `react-native-bobuttons` is its own template directory
(own `package.json`/`package-lock.json`/`App.tsx`/etc.), not a variant
layered on top of `react-native-android` through some composition
mechanism in the registry - that would be a bigger change than this one
target needs. Its Android/Gradle project, however, IS shared on disk with
`react-native-android` rather than duplicated into a second copy: both
targets' registry entries point at the one committed tree under
`templates/react-native-android/android/` and reuse the exact same
binding table, and `src/scaffold.js` copies it into the generated app via
a generic "shared directory" mechanism (no branch on target id). The
trade-off: `react-native-android` and `react-native-bobuttons` must still
be bumped together whenever the Android/Gradle scaffolding changes (there
is only one copy to bump), but neither target duplicates ~30 vendored
Gradle/Kotlin files or its binding table a second time. React Native
Android's generated output is unaffected by this - it is copied from the
exact same template path as before, and `test/output-pin.test.js` pins
its generated output byte-for-byte as proof.

**Refreshing the vendored tarball**: every step below is mandatory, in
order. Skipping any of them leaves the template in a state that either
fails `npm test` (good - caught offline) or, worse, passes `npm test` but
breaks `npm ci` for a user (bad - the reason every step here exists):

1. In the Bobuttons checkout, on the `main` commit to pack from, run the
   project's pack command. Record that commit's full 40-character SHA
   and today's date as a UTC ISO-8601 date - both are provenance facts
   you will re-record in step 5.
2. Overwrite the single tarball at
   `templates/react-native-bobuttons/vendor/bobuttons-<version>.tgz`
   (npm's default output filename) in place. Confirm with `ls` that
   exactly one `bobuttons-*.tgz` exists under that `vendor/` directory
   afterwards - stale tarballs from a previous version must never
   accumulate.
3. Re-copy Bobuttons' `THIRD-PARTY-NOTICES.md` into
   `templates/react-native-bobuttons/THIRD-PARTY-NOTICE.md`'s bundled-
   dependency section. It is not inside the packed tarball (`files:
   ["dist"]`), so this step is easy to forget and nothing fails if it is
   skipped.
4. Regenerate `templates/react-native-bobuttons/package-lock.json`
   (`npm install` inside that template directory) so its `bobuttons`
   entry's `resolved` and `integrity` match the new tarball's bytes.
   `test/template-lockfile-sync.test.js` fails if the lockfile and the
   manifest drift apart.
5. Re-record the new version, the 40-character source commit SHA, the
   UTC pack date and the tarball's byte size in all three places that
   carry them: `templates/react-native-bobuttons/package.json`'s
   provenance field, `templates/react-native-bobuttons/README.md`, and
   this README's bullet list above.
6. Re-run the full suite (`npm test`). Then generate a bobuttons app and
   run `npm test` inside it, per the Jest note in
   `templates/react-native-bobuttons/README.md`.
7. Re-check `npm audit` inside the regenerated template and record the
   new advisory counts (moderate/high/critical) wherever the previous
   counts were written down. `npm audit fix` is prohibited - it unpins
   exact dependency versions and defeats reproducibility; resolve any
   new advisory explicitly instead.

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
templates/react-native-android/  React Native Android template (its android/
                                  subtree is also shared by react-native-bobuttons)
templates/react-native-bobuttons/ React Native + bobuttons template
test/                            node:test suite
```
