# APPGENERATOR-3 — Add React Native Android app generation

Architect context for the Developer. Written before the ImplementationPlan.
Branch: `APPGENERATOR-3-add-react-native-android-app-generation`

Read §0 first: five places where this plan deliberately departs from the literal text of an
AC, each with evidence. Everything in §2 was measured on this host, not inferred.

---

## 0. Decisions that need the human's eye (nothing else here is a surprise)

| # | Issue | Evidence | Decision taken |
| --- | --- | --- | --- |
| D1 | **AC5 lists `AndroidManifest.xml` as a site the applicationId must be written to. Writing it there breaks the build.** | The RN template's `android/app/src/main/AndroidManifest.xml` has **no `package` attribute** (verified in both the 0.83.10 and 0.88.0 templates). The AGP version is **8.12.0**, set by `@react-native/gradle-plugin` (`gradle/libs.versions.toml`, `agp = "8.12.0"`); AGP ≥ 8.0 rejects a `package` attribute in a source manifest outright. | AC5 is satisfied **by construction**: the manifest references `.MainApplication` / `.MainActivity` relatively and AGP resolves those against `namespace` — i.e. against the derived applicationId. A test asserts the generated manifest contains **no** `package=` attribute, with the reason in a comment, so a future "fix" cannot reintroduce it. |
| D2 | **AC5 lists `app.json` as a site for the applicationId. Bare RN's `app.json` has no applicationId key.** | Upstream `app.json` is exactly `{ "name", "displayName" }`; `index.js` imports `name` from it and passes it to `AppRegistry.registerComponent`. | `app.json.name` and `app.json.displayName` are bound to the **app name** (not the applicationId), which is what removes the template identity from that file. Adding an invented `android.package` key would be config nothing reads. The applicationId's single source of truth stays the sanitisation function and its three real sites (`settings.gradle`, `build.gradle` ×2, Kotlin package + directory). |
| D3 | **The sanitisation function is deterministic but NOT injective.** AC5(a) only requires *two* names to differ, which is satisfiable, but the general property is false. | `-`, `.` and `_` all map to `_`, so `my-app`, `my.app` and `my_app` → `my_app` → `com.my_app`. The leading-digit rule adds a second class: `1app` → `a1app`, colliding with an app literally named `a1app`. | Keep the collapsing map (AC4 mandates it: every name the validator accepts must build). Pin the collision as **known**: the test table contains the colliding pair and asserts they collide, so nobody discovers it in the field. Consequence documented in both READMEs: two apps whose names differ only in separators share an applicationId **and** share the upstream debug keystore, so they cannot be installed side by side on one device. |
| D4 | **React Native version choice is coupled to AC12 and AC13.** | `react-native@0.88.0` declares `engines.node: "^22.13.0 \|\| ^24.3.0 \|\| >= 26.0.0"`; `react-native@0.83.10` declares `">= 20.19.4"` (both read from the registry). The current global floor is `>=22.12.0`, pinned by three assertions at `test/cli.test.js:28-41`. | **Recommend `react-native@0.83.10`.** With it, `max(all targets) = 22.12.0` (still Electron 44.7.1), so AC13 is met with **no floor raise**, every existing assertion stays true (AC12), and the single-global-floor model stays honest. With 0.88.0 the floor must rise to 22.13.0 → those three assertions must be edited, *and* a single floor becomes a lie, because 0.88's range excludes Node 23.x/25.x while a floor check accepts them. If the human prefers latest RN, that is a template bump plus those edits — flagged, not silently taken. |
| D5 | **The template is vendored MIT-licensed Meta code.** | `@react-native-community/template@0.83.10` ships `LICENSE` (MIT, Meta Platforms). | Keep the notice: `templates/react-native-android/THIRD-PARTY-NOTICE.md` records package, exact version, upstream URL and the MIT text. This repo is `UNLICENSED`, so it cannot be left implicit. |

One more, smaller: upstream's own `template.config.js` declares `placeholderName: 'HelloWorld'`
and `titlePlaceholder: 'Hello App Display Name'` — i.e. **upstream RN generates by blind token
substitution**, exactly the mechanism APPGENERATOR-1 deleted on purpose (context §3 finding 6).
We vendor the files and bind names ourselves (§5). `android/app/src/main/res/values/strings.xml`
therefore **is** in scope: `Hello App Display Name` is upstream's template identity and is the
app's launcher label, so leaving it is precisely the leak AC5(b) exists to prevent.

---

## 1. Domain and key files

**Domain:** Node CLI app scaffolder / project templating, now multi-target; plus React Native +
Android (Gradle/AGP) build tooling for the new target.

**Repo state (verified):** clean tree except untracked `docs/`. 31 tracked files, 11 of them under
`templates/electron-gluestack/`. Baseline suite: **55 tests, 54 pass, 1 skipped (the opt-in e2e),
0 fail, 534 ms**. Node v22.20.0, npm 10.9.3. **No JDK and no Android SDK on this host** (`java`
not on PATH, `ANDROID_HOME`/`ANDROID_SDK_ROOT` unset, no `sdkmanager`/`adb`) — which is why AC9's
fail-loudly rule is the only thing standing between this ticket and an unverifiable claim.

| Path | Role in this ticket |
| --- | --- |
| `src/cli.js` | gains `--target`, target-aware `HELP_TEXT`, identifier derivation **before** acquisition, per-target next steps |
| `src/scaffold.js` | gains per-target template root / skip list / dotfile renames / name bindings; electron path unchanged |
| `src/targets.js` **(new)** | the target registry — single source of truth for ids, help summaries, skip lists, bindings, next steps |
| `src/android-identifier.js` **(new)** | the one documented, deterministic sanitisation function (AC4/AC5) |
| `src/name-bindings.js` **(new)** | the allow-listed per-site edit executor (AC6) |
| `src/install.js` | **no change** — §2.3 verifies the existing `existsSync` guard already does the right thing |
| `src/validate-app-name.js` | **no change** — AC4 forbids tightening |
| `src/errors.js` | **no change** — AC14, no new exit code |
| `templates/react-native-android/` **(new)** | vendored bare RN 0.83.10 template, Android only |
| `package.json`, `README.md`, `.gitignore` | description / docs / ignore patterns (AC7, AC10, AC11, AC13) |
| `test/` | 5 new files, 4 extended (§7) |

---

## 2. Spike results — all measured on this host

### 2.1 Flavour: bare React Native Community CLI template, **vendored**. Not Expo, not `cli init`.

AC3 requires a committed `android/` Gradle project "not produced later by a separate
prebuild/eject step the user has to run". Expo materialises `android/` from `app.json` via
`expo prebuild` at build time, so it fails AC3 by construction and fails AC10 (the generated
`android/` would not be lockfile-reproducible). Running `npx @react-native-community/cli init` at
generation time is also out: it is a network dependency inside the generator's failure window, it
is not pinnable, and it performs exactly the blind token substitution AC6 prohibits. So: vendor
the files from `@react-native-community/template`, and bind names ourselves.

### 2.2 The template tree is small; the cost is all in `node_modules`

- Template tree: **436 KB** total, **272 KB** of it `android/`, **88 KB** `ios/` (removed — §2.4).
  Binary files that must survive the copy intact: `android/gradle/wrapper/gradle-wrapper.jar`
  (Zip), `android/app/debug.keystore` (Java KeyStore), 10 launcher PNGs. **No symlinks** anywhere
  in the tree (verified), so `dereference: false` stays correct.
- `android/gradlew` is mode **0755** in the upstream tarball. The exec bit must survive git and
  `cpSync` or the documented build command fails with "permission denied" — pinned by a test.
- All text files are LF, and the repo has no `.gitattributes`, so nothing re-writes line endings.
  This is what makes the single-line edits of §5.3 leave the rest of each file byte-for-byte
  identical.

### 2.3 Install is verified, and `install.js` needs no change

With direct dependencies pinned to the exact versions npm resolved (table in §6):

- `npm install --no-audit --no-fund` → **exit 0, 861 packages, 23 s**.
- `rm -rf node_modules && npm ci --no-audit --no-fund` → **exit 0, 861 packages, 3 s warm**.
- `node_modules` = **319 MB** (vs 774 MB for the Electron target).
- The only package in the tree with an install script is **`fsevents`** (macOS-only, optional), so
  unlike Electron there is **nothing to front-load**: `npm ci` *is* the complete JS install.
- `node_modules/electron` **does not exist** in this tree, so install phase 2's
  `existsSync(node_modules/electron/install.js)` guard skips it silently. AC7's "must not run for
  this target, degrade gracefully, do not hard-fail" is therefore already satisfied by existing
  code. **Do not touch `install.js`.**
- `npm audit`: **7 moderate, 0 high, 0 critical** (the chain runs through
  `@react-native-community/cli-platform-apple` ← `cli-platform-ios`, which still arrives
  transitively via `@react-native-community/cli` after the direct dev-dependency is dropped).
  Record in the README and re-check on every lockfile regeneration — same convention as the
  Electron target.
- **Floating transitives are real here too** (the same finding as APPGENERATOR-1 §2.5): 39 `*` /
  `latest` range declarations in the resolved graph (`@types/node "*"` from the jest packages,
  `@babel/core "*"` peers, `react` / `react-native "*"` peers). Exact pins on direct dependencies
  do **not** constrain those. **Only the committed lockfile does** — which is why AC10 requires it.

### 2.4 Android toolchain facts the READMEs must state (AC7, AC9)

- Gradle wrapper distribution **9.0.0** (`android/gradle/wrapper/gradle-wrapper.properties`).
- AGP **8.12.0**, Kotlin **2.1.20**, `compileSdk 36`, `buildToolsVersion 36.0.0`, `minSdk 24`,
  `targetSdk 36`, `ndkVersion 27.1.12297006`, `newArchEnabled=true`, `hermesEnabled=true`.
- Gradle 9.0 and AGP 8.12 both require **JDK 17 or newer**. The Developer must confirm the exact
  supported range against the RN 0.83 release notes before writing a number into a README as fact;
  do not guess it into existence.
- The **first** `assembleDebug` downloads the Gradle 9.0.0 distribution (~130 MB) and the Maven
  artifacts for AGP / Kotlin / React Android, then compiles native code with the NDK. The
  generator front-loads **none** of that (out of scope, and it would require the Android SDK on the
  *generating* host, which is not a generator prerequisite). Both READMEs must say so plainly, so
  "installs its dependencies" is not overstated — this is the honesty obligation that the Electron
  binary front-load discharges for the other target.
- The generator README must also carry the **exact manual fallback command** for the build proof:
  `APPGEN_E2E=1 npm run test:e2e:android`, and for a hand check
  `cd <app>/android && ./gradlew assembleDebug`.
- `ios/`, `Gemfile`, `_bundle/config` and `_xcode.env` are **removed**, and removal is *mandatory*,
  not cosmetic: `ios/` carries ~60 occurrences of `HelloWorld` in file contents **and in directory
  names**, so keeping it would either fail AC5(b) or drag an out-of-scope iOS rename into this
  ticket.

---

## 3. Anti-pattern findings the implementation must not replicate

The workflow's configured skill identifier arrived **empty**, and the shared skills directory
(`/home/ivana/.claude/skills` → `/home/ivana/Desktop/Code/.claude/skills`) is outside this
ticket's permitted project scope, so — exactly as in APPGENERATOR-1 §3 — the scan was performed
directly: a full read of `src/`, `bin/` and `test/`, plus a hazard scan of the new Gradle/RN
surface.

**Clean in existing code (do not regress):** no `exec`, no `shell: true`, no string-concatenated
commands (`src/install.js:44` spawns with an argv array); no text substitution anywhere; no
`process.cwd()` read outside the one documented default at `src/cli.js:201`; cleanup is
synchronous, snapshot-bounded, and re-asserts containment before every `rmSync`.

| # | Severity | Finding (new surface) | Required mitigation |
| --- | --- | --- | --- |
| 1 | **HIGH** | **Blind token replacement across the template tree.** The single most likely implementation of this ticket, because it is literally what upstream RN's `template.config.js` does (`placeholderName: 'HelloWorld'`). It is what APPGENERATOR-1 deleted on purpose; the leak it prevented (`<title>probe</title>`) is on record. | The executor has **no global-replace operation at all**. Three op kinds only: `json` (parse/set/stringify), `line` (one anchored regex, **match count must equal exactly 1** or exit 4), `moveDir`. §5.3. |
| 2 | **HIGH** | **A derived identifier flowing into a filesystem path.** `android/app/src/main/java/com/<segment>/` is built from user input — a separator or `..` in `<segment>` would escape the target. | The sanitiser's output is re-validated against `/^[a-z][a-z0-9_]*$/` before any use; the executor additionally asserts every resolved path (including `moveDir`'s destination) stays inside the acquired target, matching the repo's existing defence-in-depth convention. |
| 3 | **HIGH** | **Copying Gradle build output out of the template.** Certain to exist on the maintainer's disk the first time they verify a build inside `templates/react-native-android/`: `android/build`, `android/app/build`, `android/.gradle`, `android/app/.cxx`, `.kotlin`, and `local.properties`, which pins an **absolute SDK path from the maintainer's machine**. Same class as APPGENERATOR-1 finding 5 (`node_modules`/`dist`), with an added host-path leak. | **Per-target** skip list in the registry (electron's stays exactly `["node_modules","dist"]` so AC12 holds); root `.gitignore` patterns; a test asserting none of them lands in a generated app even when present in the template. |
| 4 | **HIGH** | **Tightening `validate-app-name.js` to make Android identifiers easy.** The tempting fix for `my-app`; it would break the most natural name a user types, for one target only. | Explicitly prohibited by AC4 / TaskSpec D1. `src/validate-app-name.js` is not in `files_to_modify`. Sanitise instead. |
| 5 | **MEDIUM-HIGH** | **Anchors silently rotting.** A binding regex that matches 0 times leaves the template's own package name in the generated app; today's suite would not notice, and the failure surfaces either as a confusing Gradle error or as a working app with the wrong applicationId. | `test/targets.test.js` runs **every** binding anchor against the **committed** template and asserts exactly one match per anchor — offline, in milliseconds. An architectural fitness function in the APPGENERATOR-1 study-guide §5 sense. The generation-time count check is the second layer. |
| 6 | **MEDIUM-HIGH** | **Floating RN dependency versions** (§2.3: 39 `*` declarations in the graph). | Exact pins on all direct deps **plus** the committed lockfile installed with `npm ci`; `test/template-lockfile-sync.test.js` extended to iterate the registry instead of hardcoding one path (AC10). |
| 7 | **MEDIUM** | **`run-android` in the e2e test.** The obvious command; it needs a connected device or a running emulator, so the proof would fail for a reason unrelated to the build. | Use `android/gradlew assembleDebug --no-daemon`, assert exit 0 and that `android/app/build/outputs/apk/debug/app-debug.apk` exists. `--no-daemon` also stops the test leaking a 2 GB-heap Gradle daemon onto the developer's machine and holding locks inside a `t.after`-deleted tmp dir. |
| 8 | **MEDIUM** | **A second target made invisible.** `HELP_TEXT`, `README.md` and `package.json.description` are all Electron-only today; adding a target without touching them is the default outcome of a minimal diff. | AC11. The registry carries each target's one-line summary and `HELP_TEXT` renders from it, so a third target cannot be added without appearing in `--help`. Asserted by a test. |
| 9 | **MEDIUM** | **"Unchanged output" asserted by nobody.** `scaffold.test.js` / `cli.test.js` check behaviour, not output, and the electron path is about to be re-plumbed through a new executor. | AC12's pin: committed file manifest for a generated electron tree + verbatim `package.json` content + a committed SHA-256 of the generated `package-lock.json`, with the deliberate-update recipe in a comment. |
| 10 | **MEDIUM** | **Target validation after acquisition.** Mis-ordering it would create (and then clean up) a directory for a typo'd `--target`, turning a usage error into a filesystem write. | Order is the security property (APPGENERATOR-1 §5): node floor → parse args → **resolve target** → validate name → **derive + re-validate identifiers** → containment → atomic acquire → signal handlers → scaffold → install. Exit 2 paths still write nothing; asserted by a test on `readdirSync(cwd)`. |
| 11 | **LOW-MEDIUM** | **Committed binaries** (`gradle-wrapper.jar`, `debug.keystore`) and the **exec bit** on `gradlew`. A `*.jar` / `*.keystore` / bare `build/` ignore rule, or a copy that strips modes, breaks the build silently. | Root `.gitignore` gains **only** the five precise `templates/*/android/...` paths of §8 risk 7 — never a bare `build/`, `*.jar` or `*.keystore`. A test asserts `gradlew` is executable in the generated tree and that the jar and keystore are byte-identical to the template's. |
| 12 | **LOW** | **Shared debug keystore across every generated app.** Upstream ships Android's universal debug key. Combined with D3's collisions, two colliding apps are indistinguishable on a device. | Standard Android practice, not a defect — but documented in both READMEs rather than discovered. Release signing is explicitly out of scope. |

**Not applicable, stated so it is not silently skipped:** no database, ORM, HTTP layer or tenant
table, so N+1, row scoping and schema migrations have no literal counterpart. The analogues, all
unchanged from APPGENERATOR-1: the "tenant" is a generated app (isolation — now extended to the
new target in `independence.test.js`); the "N+1" is per-app install cost (319 MB here, accepted,
must not be optimised away with workspaces or symlinks); the "migration" is that generated apps
have **no** update/eject path (out of scope, stated in both READMEs), and no app already generated
is affected by this ticket. One genuinely new shared-host surface: `~/.gradle` (wrapper
distributions + Maven cache), which joins `~/.npm` and `~/.cache/electron` as shared, immutable,
content-addressed host state.

---

## 4. Shared services at risk

1. **`src/scaffold.js`** — stops being "the Electron scaffolder" and becomes shared infrastructure,
   exactly as APPGENERATOR-1 §4.4 predicted. Blast radius: every generation of both targets. Kept
   safe by (a) the electron bindings going through the same `rewriteJsonName` code, (b) AC12's
   output pin, (c) the unchanged `scaffold(target, { appName })` signature and `TEMPLATE_ROOT`
   export that existing tests import.
2. **`src/cli.js`** — the orchestrator and the only exit-code mapping point. Changes are additive:
   one new option, one target lookup, one derivation step. The "no target given" path must come out
   byte-identical (AC2), including the final next-steps text.
3. **`src/install.js` / `src/cleanup.js` / `src/target-dir.js` / `src/errors.js`** — untouched.
   Cleanup now has to remove a tree containing a Gradle wrapper jar and, after a failed install,
   319 MB of `node_modules`; the snapshot contract already covers that with no change, because it
   deletes top-level entries that were absent at acquisition.
4. **The user's cwd and the AppGenerator repo** — unchanged guarantees;
   `independence.test.js`'s `git status --porcelain` assertion is the proof, and it must now also
   cover the new target.
5. **`test/cli.test.js`, `test/scaffold.test.js`, `test/independence.test.js`,
   `test/template-lockfile-sync.test.js`** — shared test files. Extend by **appending cases** or by
   looping over the registry; do not weaken an existing assertion. The only existing assertions
   that may be restructured are the two whole-template walks in `scaffold.test.js` (symlink scan,
   byte-identical-after-run), which become a loop over the registry's template roots with
   **identical semantics for electron** — and the byte-identity walk should compare SHA-256 of raw
   bytes rather than utf8 strings, now that the template tree contains a jar, a keystore and PNGs.

---

## 5. Implementation approach rationale

### 5.1 Target selection: `--target <id>`, default `electron-gluestack`

A flag, not a positional. A positional type argument makes `appgenerator react-native-android`
ambiguous (is that a target, or an app named `react-native-android`?) and would put AC2's
back-compat contract at the mercy of positional-count heuristics. `--target` is purely additive:
`appgenerator <app-name> [--no-install]` keeps the same parse, the same `rest.length > 0`
extra-positional error, the same output and the same exit codes. An unknown target is a
`usageError` (exit 2) listing the valid ids, raised **before** acquisition. The argument is never
made required. A test pins the no-target default by generating with no `--target` and asserting
`electron/main.cjs` exists while `android/` does not.

AC2 says the no-target invocation's "output" is unchanged while AC11 requires `HELP_TEXT` to list
the targets. Reconciled explicitly: "output" means **generation** output (the created tree and the
next-steps block); `--help` text is the one user-facing string AC11 deliberately changes.

### 5.2 The registry is the single source of truth (`src/targets.js`)

One object per target: `id`, `summary` (rendered into `HELP_TEXT`), `templateDir`, `skip` (cpSync
basename skip list), `dotfiles` (underscore→dot renames), `derive` (identifier derivation, or
`null`), `bindings`, `nextSteps`. Electron's entry reproduces today's constants exactly:
`skip: ["node_modules","dist"]`, `dotfiles: ["_gitignore"]`, `derive: null`, the two `json`
bindings, and the current next-steps strings. This is what makes AC11 structural rather than a docs
chore — a target that is not in the registry cannot be generated, and one that is in it cannot be
missing from `--help`.

### 5.3 Name binding: a deliberate, allow-listed extension of the APPGENERATOR-1 invariant (AC6)

The standing invariant is "exactly two JSON parse/set/stringify rewrites, no text substitution
anywhere" (APPGENERATOR-1 context §3 finding 6, study guide §4). It does not cover Gradle,
manifests or source-directory renaming, so this ticket extends it **explicitly**. The extension,
and why it is not a slippery slope back to token replacement:

- **Three operations, no more.** `json` (the existing `rewriteJsonName`: parse, set, stringify,
  2-space indent, trailing newline), `line` (one regex anchored to one known line in one known
  file), `moveDir` (one directory rename). There is **no operation that replaces a token across
  files**, so the prohibited mechanism is not merely discouraged — it does not exist in the code.
- **Every `line` binding must match exactly once.** Zero matches or two-plus matches is a
  `scaffoldError` (exit 4) naming the file and the anchor. Blind replacement cannot tell those
  cases apart; this can, and that is the whole difference. A `line` edit rewrites one line and
  leaves the rest of the file byte-for-byte identical (§2.2: LF only, no `.gitattributes`).
- **Replacements are inserted via a function replacer**, never a replacement string, so
  `$&`-class patterns cannot be interpreted. (The validator's alphabet `[a-z0-9._-]` already makes
  `$` impossible — which is also why **no site needs escaping**: no quote, backslash, `<`, `&` or
  newline can reach a Gradle string, an XML text node, a Kotlin string literal or a JSON value.
  Worth stating, because it is the property that makes single-line edits safe here and would
  **not** hold if name validation were ever loosened.)
- **Electron keeps using the existing code.** Its two rewrites are the same `rewriteJsonName`
  function, reached through the registry instead of via two inline calls. AC12's byte-level output
  pin is the proof that this re-plumbing changed nothing.
- **The anchors are offline-tested** against the committed template (finding 5), so drift fails in
  `npm test`, not at a user's generation.

The complete binding table for `react-native-android` — this is the allow-list, and the exhaustive
answer to "where does the name go":

| # | Site | Op | Value |
| --- | --- | --- | --- |
| 1 | `package.json` → `name` | `json` | app name |
| 2 | `package-lock.json` → `name`, `packages[""].name` | `json` | app name |
| 3 | `app.json` → `name`, `displayName` | `json` | app name |
| 4 | `android/settings.gradle` → `rootProject.name = '…'` | `line` | **sanitised segment** |
| 5 | `android/app/build.gradle` → `namespace "…"` | `line` | `com.<segment>` |
| 6 | `android/app/build.gradle` → `applicationId "…"` | `line` | `com.<segment>` |
| 7 | `android/app/src/main/java/com/<tpl>/MainActivity.kt` → `package com.…` | `line` | `com.<segment>` |
| 8 | …same file → `getMainComponentName(): String = "…"` | `line` | app name (must equal site 3) |
| 9 | `android/app/src/main/java/com/<tpl>/MainApplication.kt` → `package com.…` | `line` | `com.<segment>` |
| 10 | `android/app/src/main/res/values/strings.xml` → `<string name="app_name">…</string>` | `line` | app name |
| 11 | `android/app/src/main/java/com/<tpl>/` → `…/com/<segment>/` | `moveDir` | segment |

Sites 7-9 run **before** site 11 (edit, then move), so the anchors are matched at a known path.
Site 4 uses the sanitised segment rather than the raw name on purpose: a Gradle `rootProject.name`
containing `.` is an edge case nobody needs, and reusing the one derived identifier keeps AC4's
"Android identifiers come from one function" property intact. Sites 3 and 8 must stay equal or the
app registers under a key Android never asks for and shows a blank screen — pinned by a test that
reads both out of a generated app and compares them.

### 5.4 The sanitisation function (`src/android-identifier.js`, AC4/AC5)

`androidSegment(appName)` — pure, zero I/O, table-driven, applied to a name the validator has
already accepted (`/^[a-z0-9][a-z0-9._-]*$/`, ≤214 chars):

1. lower-case (defensive: the function is public and unit-tested standalone);
2. map every character outside `[a-z0-9_]` to `_` — for this alphabet that is exactly `-` and `.`;
3. if the first character is a digit, prefix `a`. **Not `_`**: Android requires every applicationId
   segment to *start with a letter* (`[a-zA-Z0-9_]` elsewhere), so the Java-legal leading
   underscore is not applicationId-legal;
4. if the result is a Java **or** Kotlin reserved word (union table in the module, including
   `true` / `false` / `null` and Kotlin's hard keywords), append `_`: `class` → `class_`;
5. assert the result matches `/^[a-z][a-z0-9_]*$/` and is not reserved. **This assertion is
   provably unreachable** for any name the validator accepts (step 2 maps the alphabet into
   `[a-z0-9_]`, the first character is always `[a-z0-9]`, step 3 makes it a letter, so the result is
   never empty and always legal). It exists anyway, raises `usageError` (exit 2) **before any
   filesystem write**, with a message naming the app name and the illegal derived value, and its
   unreachability is a documented row in the test table. That is AC4's "names sanitisation
   genuinely cannot rescue (**if any**)" answered with evidence: the set is empty, and the guard is
   there in case name validation is ever loosened.

`applicationId(appName)` = `com.${androidSegment(appName)}`. Longest case: a 214-character name
yields a 218-character applicationId — a test-table row, comfortably inside Android's practical
package-name limits, but worth pinning rather than assuming.

Required test-table rows (the ones review named, plus the ones the rules imply):
`my-app → my_app`, `1app → a1app`, `a.b → a_b`, `my.app_name → my_app_name`, `a → a`,
`class → class_`, `in → in_`, `myapp2 → myapp2`, `x`×214 → legal and length 214,
**collision pair** `my-app` / `my.app` → both `my_app` (asserted equal, with the consequence in a
comment), and a fuzz loop over the validator's alphabet asserting the output is always legal and
never reserved.

AC4's stronger claim — "EVERY app name the validator accepts must yield a buildable app" — cannot
be proven offline for every name, so the plan's proxy is concrete: `test/scaffold-rn.test.js`
generates with the adversarial-but-valid set `my-app`, `1app`, `a.b`, `class` and asserts, for
each, that `namespace`, `applicationId`, both Kotlin `package` declarations and the Kotlin
directory path all agree on `com.<segment>` — the exact invariant a Gradle build would fail on.

### 5.5 Verification of the build (AC9)

`test/e2e/android-build.test.js`, following `test/e2e/full-generate.test.js` line for line:
`APPGEN_E2E` unset → `t.skip` with a one-line reason; `APPGEN_E2E=1` with a prerequisite missing →
`assert.fail` naming the missing prerequisite, **never** a skip. Prerequisites are checked
individually so the failure message is actionable: `java` on PATH, and `ANDROID_HOME` or
`ANDROID_SDK_ROOT` set and containing `platform-tools`. Then: generate with
`--target react-native-android`, run `android/gradlew assembleDebug --no-daemon`, assert exit 0
and that `android/app/build/outputs/apk/debug/app-debug.apk` exists. Generous timeout (first run
downloads the Gradle distribution, Maven artifacts and compiles with the NDK). New script
`test:e2e:android`; **`test:e2e` keeps pointing at the Electron file only**, because making it
require a JDK and an SDK would break the existing, documented Electron proof on hosts that have a
display and nothing else.

---

## 6. Exact dependency pins for the new template (measured, not guessed)

Upstream declares ten direct dependencies as ranges; AC10 requires exact pins. These are the
versions npm actually resolved here, and the versions the committed lockfile must hold:

`react-native-safe-area-context ^5.5.2 → 5.10.1`, `@babel/core ^7.25.2 → 7.29.7`,
`@babel/preset-env ^7.25.3 → 7.29.7`, `@babel/runtime ^7.25.0 → 7.29.10`,
`@types/jest ^29.5.13 → 29.5.14`, `@types/react ^19.2.0 → 19.3.0`,
`@types/react-test-renderer ^19.1.0 → 19.3.0`, `eslint ^8.19.0 → 8.57.1`, `jest ^29.6.3 → 29.7.0`,
`typescript ^5.8.3 → 5.9.3`. Already exact upstream: `react 19.2.0`, `react-native 0.83.10`,
`@react-native/new-app-screen 0.83.10`, `@react-native-community/cli 20.0.0`,
`@react-native-community/cli-platform-android 20.0.0`, `@react-native/babel-preset 0.83.10`,
`@react-native/eslint-config 0.83.10`, `@react-native/metro-config 0.83.10`,
`@react-native/typescript-config 0.83.10`, `prettier 2.8.8`, `react-test-renderer 19.2.0`.
Dropped: `@react-native-community/cli-platform-ios` (iOS out of scope; it still arrives
transitively, so this is manifest hygiene rather than a tree change — revert it if
`react-native config` ever complains). The template manifest keeps
`"engines": { "node": ">=22.12.0" }` — the single global floor, stricter than RN's own
`>= 20.19.4`, which the README explains.

Everything else stays plain/default, as the TaskSpec's out-of-scope list requires so that
APPGENERATOR-2 can layer bobuttons on top: no UI library, jest/eslint/prettier/TypeScript kept as
upstream ships them, `App.tsx` unchanged, and the template's own `_gitignore` vendored **verbatim**
(its iOS sections are harmless, and trimming them is churn nothing asks for).

---

## 7. Tests

**New:** `test/android-identifier.test.js` (§5.4 table + fuzz); `test/targets.test.js` (registry
integrity: template dirs exist, every anchor matches exactly once against the committed template,
every id appears in `HELP_TEXT`, default is `electron-gluestack`); `test/scaffold-rn.test.js` (the
full §5.3 site list; the §5.4 adversarial-name consistency check; `gradlew` exec bit; jar and
keystore byte-identical to the template; no `package=` in the manifest; no `ios/`; sites 3 ≡ 8; two
names → two applicationIds; no template identity in any generated file **content or path** for the
tokens `appgen-rn-template`, `appgenrntemplate`, `helloworld`, `HelloWorld`,
`Hello App Display Name` — scanning text files only and byte-comparing the known binaries instead;
and no `build` / `.gradle` / `local.properties` copied even when present in the template);
`test/output-pin.test.js` (AC12); `test/e2e/android-build.test.js` (AC9).

**Extended, by appending cases or looping over the registry — never by weakening an existing
assertion:** `test/template-lockfile-sync.test.js` (all targets, AC10); `test/cli.test.js`
(no-target default pins electron; `--target react-native-android --no-install` produces
`android/settings.gradle`; `--target bogus` → exit 2 with the valid ids listed and
`readdirSync(cwd)` empty; `--help` lists both ids); `test/scaffold.test.js` (the symlink walk and
the byte-identical-after-run walk iterate the registry's template roots, the latter hashing raw
bytes); `test/independence.test.js` (a second case generating two RN apps: no cross-references,
each owns its `node_modules`, no escaping symlinks, repo still clean).

---

## 8. Risks and constraints

1. **The Android build cannot be proven on this host** (no JDK, no SDK). AC9's fail-loudly rule is
   the entire mitigation and must not be softened into a skip. Until someone runs
   `APPGEN_E2E=1 npm run test:e2e:android` on a provisioned host, AC8 is *designed for* but not
   *demonstrated*. Say so when handing over.
2. **The JDK number is unverified.** Gradle 9.0 and AGP 8.12 require ≥ 17; the exact supported
   range must be read from the RN 0.83 release notes before it is stated as fact in a README.
3. **Sanitisation collisions** (D3) — deterministic, documented, pinned by a test; not fixable
   without ugly escaping or global state.
4. **AC10 requires editing an existing test file that AC12 calls unmodifiable.** AC10 says
   `test/template-lockfile-sync.test.js` must be extended to all targets; AC12 says "every existing
   test passes unmodified". Reconciliation taken: "unmodified" means no existing assertion is
   weakened or re-pointed, not that no test file is ever opened. Edits are confined to appending
   cases and to looping existing assertions over the registry; the electron semantics of every
   existing assertion stay identical, and AC12's new output pin is the independent check that this
   is true. Flagged rather than assumed.
5. **AGP/Gradle move fast.** The vendored template is frozen at AGP 8.12.0 / Gradle 9.0.0 / Kotlin
   2.1.20, and generated apps inherit it with no update path (the same constraint as the Electron
   target).
6. **319 MB of `node_modules` per generated app**, plus a first-build Gradle/Maven/NDK download of
   roughly the same order into `~/.gradle`. Inherent to independence; must not be "optimised" with
   workspaces or symlinks.
7. **Committed binaries and one mode bit are load-bearing.** The root `.gitignore` must gain only
   these precise patterns — `templates/*/android/.gradle/`, `templates/*/android/build/`,
   `templates/*/android/app/build/`, `templates/*/android/app/.cxx/`,
   `templates/*/android/local.properties`, `templates/*/.kotlin/` — and must **never** gain a bare
   `build/`, `*.jar` or `*.keystore` rule, which would silently un-track the Gradle wrapper or the
   debug keystore and break every generated build.
8. **RN 0.83.10 is not the latest line** (0.86 and 0.88 exist). Deliberate, per D4, and reversible
   with one template bump plus the floor edits that bump requires.
9. **7 moderate advisories** in the generated tree (0 high, 0 critical). `npm audit fix` is
   **prohibited** — it unpins and defeats reproducibility. Re-check on every lockfile regeneration.
10. **Linux only**, unchanged: `npm` is `npm.cmd` on Windows, and the documented build command
    assumes the POSIX wrapper (`gradlew`, not `gradlew.bat`).
11. **`docs/` is untracked today** (`git status` shows `?? docs/`), so this file and the
    APPGENERATOR-1 context are not committed. AC6 requires the name-binding rationale to be
    recorded in `docs/context/`; for that to mean anything, `docs/` must be committed on this
    ticket's branch.

---

## 9. Scope discipline

Deliberately **not** done, despite being adjacent and tempting: iOS anything; running a Gradle
build during generation (and therefore no new exit code — AC14); front-loading the Gradle
distribution or Maven artifacts; provisioning the Android toolchain; CI workflow files; release
signing, keystores, AAB, publishing; a UI component library in the RN template (APPGENERATOR-2's
job); bobuttons; touching the Electron target's stack or the gluestack→Tamagui question; any
update/eject path; loosening name validation; a `--list-targets` command (`--help` covers AC11); a
range-aware Node version checker (AC13 mandates one global floor, and D4's version choice makes one
floor both sufficient and truthful); trimming the RN template's dev tooling (jest/eslint/prettier/
TypeScript) or its vendored `_gitignore` — "plain/default" is the instruction, and every deviation
is one a future maintainer has to diff against upstream.

Deliberately **kept** despite being extra, each with its reason: the unreachable
post-sanitisation assertion (§5.4 step 5), because it is what turns a future loosening of name
validation into an exit 2 rather than a path escape; the offline anchor test (finding 5), because
the binding mechanism's whole safety argument is "it fails loudly instead of leaking", which is
only true if something checks; and the `THIRD-PARTY-NOTICE.md` (D5), which is a licence obligation
rather than a nicety.

**One addition is not traceable to a specific AC clause and is flagged for the human:** the
per-target `nextSteps` string. Electron's text stays byte-identical (AC2), but the RN target needs
its own, because an Android app is started with `npm start` (Metro) **plus** `npm run android` —
printing the Electron next-steps block would actively mislead. Strike it if the preference is a
zero-extras diff; the cost is a misleading three-line message at the end of every RN generation.
