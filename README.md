# AppGenerator

A `create-react-app`-style generator that scaffolds an independent Electron
desktop app preloaded with [gluestack-ui](https://gluestack.io/) (a
temporary stand-in for a future in-house component library). This is the
Electron-only proof of concept; a React Native target is planned later and
will sit alongside this template without touching generator core.

## Requirements

- **Linux only** for this proof of concept (macOS/Windows are unverified:
  `npm` is `npm.cmd` on Windows and the generated app's `smoke` script uses
  POSIX env syntax).
- **Node `>=22.12.0`**, exactly. This floor comes from the generated app's
  own dependencies, not a vague "LTS": `electron@44.7.1` declares
  `engines.node: ">=22.12.0"` and `vite@7.3.7` / `@vitejs/plugin-react@5.2.0`
  declare `engines.node: "^20.19.0 || >=22.12.0"`. Electron is the binding
  constraint - running the generator on an older Node would let it generate
  an app it cannot build. The generator checks this itself at startup and
  exits with code `2` on an older Node, because `engines` alone only warns.

## Usage

```
node bin/appgenerator.js <app-name> [--no-install]
```

- `<app-name>` must be a valid npm package name with no path separators,
  no `..`, no absolute paths, and no leading `.`/`_` (see
  `src/validate-app-name.js` for the exact rule). Rejected names write
  nothing to the filesystem.
- By default the generator runs the full install (so `npm start` works
  immediately afterward with no manual steps). Pass `--no-install` to
  scaffold files only; the README written into the generated app then
  documents the manual `npm ci` step, and the first `npm start` after that
  may additionally need to download the Electron binary (see "Electron
  binary download" below).
- Generating into a path that does not exist creates it. Generating into
  an existing, completely empty directory (or one containing only benign
  dotfiles - `.git`, `.DS_Store`, `Thumbs.db`) is accepted. Anything else,
  **including a directory whose only content is a `.gitignore`**, is
  refused with a clear message naming the path and exit code `3` - nothing
  is overwritten or deleted. (`.gitignore` is deliberately not treated as
  benign: scaffolding renames its own `_gitignore` template file to
  `.gitignore`, and a pre-existing one would otherwise be silently
  clobbered.)

The generated app's start command is `npm start` (run from inside the new
app directory).

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

## Reproducibility and version pinning

The template pins exact versions for Electron, gluestack-ui, and every
required peer (react-native-web, etc.), and ships a committed
`package-lock.json` installed with `npm ci` (never `npm install`). This is
what makes two apps generated weeks apart scaffold identical dependency
versions - the ticket's whole premise is one shared look and feel, which a
floating version would defeat. `@gluestack-ui/themed` in particular
declares floating `latest` transitive dependencies
(`@legendapp/motion`, `@expo/html-elements`); only the committed lockfile
pins those.

**Regenerating the template lockfile** (only needed when deliberately
bumping a pinned version):

```
cd templates/electron-gluestack
rm -rf node_modules dist package-lock.json
npm install --no-audit --no-fund
npm run build && npm run smoke   # re-verify before committing
```

A test (`test/template-lockfile-sync.test.js`) fails fast if the
template's declared dependencies and the committed lockfile ever drift
apart, instead of letting every generation fail at `npm ci`.

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
bin/appgenerator.js          executable shim
src/cli.js                   argv parsing, orchestration, signal handling, exit codes
src/validate-app-name.js     pure name validation (zero I/O)
src/target-dir.js            atomic target acquisition (ownership + snapshot)
src/scaffold.js              template copy + the two JSON name rewrites
src/install.js               npm ci, then the Electron binary front-load
src/cleanup.js                the only module that deletes anything
src/errors.js                 typed errors carrying fixed exit codes
templates/electron-gluestack/ the Electron + gluestack-ui template
test/                          node:test suite (node --test, i.e. `npm test`)
```
