# APPGENERATOR-1 — Generate an empty Electron app with gluestack-ui

Architect context for the Developer. Written before the ImplementationPlan.
Branch: `APPGENERATOR-1-generate-empty-electron-app-with-gluestack-ui`

**Revision 2** — incorporates the review round. §8 maps every raised concern to a decision.
Three of my own round-1 claims were **wrong** and are corrected in place (§2.4, §2.6, §3 rows 3
and 6). Read §8 first if you read nothing else.

---

## 1. Domain and key files

**Domain:** developer tooling / scaffolding CLI (create-react-app-style) that emits Electron
desktop apps preloaded with a shared UI component library.

**Repo state (verified):** greenfield. One commit (`14e69bd`), clean tree, single tracked file
`README.md` containing the word `ok`. No `package.json`, no source, no tests, no tooling.
Every path below except `README.md` is new.

| Path | Role |
| --- | --- |
| `/home/ivana/Desktop/Code/AppGenerator/README.md` | **exists** (`ok`) — must become the real generator README |
| `/home/ivana/Desktop/Code/AppGenerator/package.json` | generator manifest, `bin`, `engines.node = ">=22.12.0"`, test scripts |
| `/home/ivana/Desktop/Code/AppGenerator/bin/appgenerator.js` | executable shim |
| `/home/ivana/Desktop/Code/AppGenerator/src/cli.js` | arg parsing, orchestration, signal handling, exit-code mapping |
| `/home/ivana/Desktop/Code/AppGenerator/src/validate-app-name.js` | pure name validation (runs before any write) |
| `/home/ivana/Desktop/Code/AppGenerator/src/target-dir.js` | **atomic** target acquisition: ownership + entry snapshot |
| `/home/ivana/Desktop/Code/AppGenerator/src/scaffold.js` | template copy + two JSON manifest rewrites (no text substitution) |
| `/home/ivana/Desktop/Code/AppGenerator/src/install.js` | `npm ci` **plus** Electron binary front-load |
| `/home/ivana/Desktop/Code/AppGenerator/src/cleanup.js` | synchronous, snapshot-bounded removal |
| `/home/ivana/Desktop/Code/AppGenerator/templates/electron-gluestack/` | the Electron target (isolated so a second target can sit beside it) |
| `/home/ivana/Desktop/Code/AppGenerator/test/` | `node:test` suite |

---

## 2. Technical spike — RESOLVED (this was the ticket's largest rework risk)

The TaskSpec flagged gluestack-ui-on-Electron as unresolved because `https://gluestack.io/ui/docs`
could not be fetched. I resolved it empirically instead, by building and running it. All results
below come from a real build and a real Electron window on this host
(Node v22.20.0, npm 10.9.3, Linux, `DISPLAY=:1`).

### 2.1 The maintained gluestack line (v5 / nativewind) does NOT fit an Electron renderer

- `gluestack-ui@5.0.3` is a **shadcn-style CLI** (`bin: gluestack-ui`) that copies component source
  into your project and depends on `simple-git` — i.e. generation would clone from a git ref at
  generation time. That is a network dependency and is **not version-pinnable**, which directly
  contradicts the ticket's one-shared-look-and-feel goal.
- `@gluestack-ui/core@5.0.15` is the headless primitive layer (`creator/` + `aria/` + `.web.js`
  variants); styling in that line comes from **nativewind 4**.
- nativewind 4's engine, `react-native-css-interop@0.2.7`, ships **only** `babel` and `metro`
  integrations (`dist/metro/*`, `dist/babel-plugin.js`, `jsx-runtime`). There is **no Vite or
  standalone PostCSS entry point.** Wiring it into a Vite-based Electron renderer means
  unsupported bundler surgery.

**Conclusion: do not use the v5/nativewind line for this proof of concept.** Per the TaskSpec's
instruction to raise rather than absorb this cost, it is raised here — and the fallback below is
already proven, so the ticket is not blocked by it.

### 2.2 The legacy line works — proven end to end

`@gluestack-ui/themed@1.1.73` + `@gluestack-ui/config@1.1.20` + `@gluestack-style/react@1.0.57`
(runtime CSS-in-JS, no tailwind/nativewind/PostCSS pipeline) under Vite + `react-native-web`,
loaded by Electron from `file://`:

```
SMOKE_RESULT={"hasRoot":true,"childCount":1,
  "txt":"Placeholder screen\ngluestack-ui Button","btnFound":true,"styleTags":19}
CONSOLE_ERRORS=[]
exit 0
```

19 injected `<style>` tags = `@gluestack-style`'s runtime styling is actually working, not just
compiling. This was then re-verified through the full generated-app path: copy files →
rewrite app name in `package.json` **and** `package-lock.json` → `npm ci` (exit 0, 545
packages) → `npm run build` → `npm run smoke` (exit 0).

### 2.3 Three bundler shims are load-bearing — do not "clean them up"

Discovered one failure at a time; each one is a hard build error without the fix.

1. `resolve.alias['react-native'] = 'react-native-web'` plus
   `resolve.extensions = ['.web.js', '.web.jsx', '.web.ts', '.web.tsx', '.js', '.jsx', '.ts', '.tsx', '.json']`
   (`.web.*` **first** — this is how `react-native-svg` picks its web implementation).
2. `react-native-svg` imports `@react-native/assets-registry/registry`, which does not exist on
   web. Installing the real package does **not** work: `@react-native/assets-registry@0.87.1` is
   now a shim that re-exports from `react-native` itself (Flow + `module.exports`), so Rollup
   cannot resolve `getAssetByID`. **Fix: alias it to a tiny local stub**
   (`shims/assets-registry.js`) and do **not** add the dependency. Verified: build + render pass
   with the package uninstalled.
3. `react-native-svg/lib/module/utils/fetchData.js` imports the Node builtin `buffer`.
   **Fix: depend on `buffer@6.0.3` and alias `buffer -> 'buffer/'`.**

Also required: `define: { global: 'window', __DEV__: ..., 'process.env.NODE_ENV': ... }` and
`base: './'` (relative asset URLs, required for `win.loadFile`).

### 2.4 Electron specifics verified — with one round-1 correction

- Electron `44.7.1`; `BrowserWindow` with `contextIsolation: true`, `nodeIntegration: false`
  renders gluestack fine — **no need to weaken Electron security for this stack.**
- A strict CSP meta tag
  (`default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; script-src 'self'`)
  works: `@gluestack-style` needs `'unsafe-inline'` styles but **no** `unsafe-eval`.
- **CORRECTION (round 2).** My spike collected renderer errors with the *deprecated* positional
  signature `on('console-message', (e, level, message) => level >= 2)`. Checked against the
  installed `electron.d.ts`: in Electron 44 those positional args still fire but are marked
  `@deprecated`, and the supported shape is a single event object whose
  `level` is `'info' | 'warning' | 'error' | 'debug'` (`WebContentsConsoleMessageEventParams`,
  d.ts line 24590). The spike's `CONSOLE_ERRORS=[]` was therefore real but written against an
  API that the next Electron major removes — and a numeric comparison against a string level
  would silently collect nothing. **The template must use
  `on('console-message', (details) => { if (details.level === 'error') ... })`.**
- Assertion scope is now pinned (see §8 concern 7): page-level errors only, `level === 'error'`
  only, DevTools never opened, **process stderr never asserted** (Chromium logs unrelated
  `Installed VAAPI version is too old` noise on this host).
- `app.getName()` returns the `name` field of the app's `package.json` (d.ts line 1285), and
  Electron **prefers `productName` when present** — so the template must not set `productName`.
  This is what lets the window title show the app name with zero text substitution.
- `xvfb-run`/`Xvfb` are **not installed** here; a display (`DISPLAY=:1`) is.

### 2.5 Reproducibility: only a committed lockfile actually pins this stack

`@gluestack-ui/themed@1.1.73` declares **floating** dependencies: `@legendapp/motion: latest`
and `@expo/html-elements: latest`. Caret/exact ranges on the direct dependencies therefore do
**not** make two apps identical. The generated `package-lock.json` does pin them
(`@legendapp/motion@2.5.3`, `@expo/html-elements@57.0.0`), so **the template must ship a
committed `package-lock.json` and generation must install with `npm ci`.**

Verified in round 2: `npm ci` does **not** rewrite the lockfile. Diffing the template lockfile
against the generated app's lockfile after a successful install shows **only** the two `name`
fields I rewrote, plus a missing trailing newline (my rewrite dropped it — write JSON with
2-space indent **and** a trailing `\n`).

### 2.6 Measured costs — CORRECTED (round 1 was wrong about where the binary comes from)

Round 1 said "`npm ci` ≈ 774 MB including the Electron binary". That is **false**:

- `electron@44.7.1` has **no `scripts` field at all** — no `postinstall`. The lockfile entry has
  no `hasInstallScript`. Registry metadata confirms it. **`npm ci` does not download the binary.**
- The binary arrives **lazily**: `require('electron')` → `index.js:getElectronPath()` → if
  `dist/` is missing it spawns `install.js`, printing `Downloading Electron binary...`.
  `install.js` is **idempotent** — `isInstalled()` fast-paths to exit 0 (measured: **54 ms** warm).
- Split: `node_modules` totals **774 MB**, of which **283 MB** is `node_modules/electron/dist`
  fetched by that lazy step. `npm ci` alone is the remaining ~491 MB / 545 packages.
- Host caches on this machine, accumulated: `~/.npm` **3.3 GB**, `~/.cache/electron` **427 MB**.
- Integrity is better than I assumed: `install.js` passes `checksums: require('./checksums.json')`
  — checksums **bundled inside the npm tarball**, which the lockfile pins by `integrity`. So the
  283 MB zip is verified against a lockfile-pinned manifest (`@electron/get@5.1.0` →
  `sumchecker@3.0.1`, verified present). A poisoned or partial cache entry fails that checksum
  **loudly**. Remote checksums are only used if `electron_use_remote_checksums` is set.
- Env knobs that pass through inherited env: `ELECTRON_MIRROR`, `electron_config_cache`,
  `ELECTRON_OVERRIDE_DIST_PATH`, `force_no_cache`, `npm_config_platform/arch`.

**Consequence for the plan:** the install step has **two** phases — `npm ci`, then
`node node_modules/electron/install.js` to front-load the binary. Without phase 2, "installed"
would mean "still needs a 283 MB download on first launch", which makes the install-on-generate
reading of AC1 dishonest and makes e2e timing nondeterministic.

---

## 3. Anti-pattern findings the implementation must not replicate

No existing code to scan (greenfield, one 5-byte README), so this is a domain-scoped scan of the
hazards inherent to scaffolding CLIs plus the specific traps surfaced by the spike.
*(Note: the workflow's configured skill identifier was empty and the shared skills directory sits
outside this ticket's permitted project scope, so this scan was performed directly.)*

| # | Severity | Finding | Required mitigation |
| --- | --- | --- | --- |
| 1 | **HIGH** | Path traversal / arbitrary write from the app name (`../../x`, `/etc/x`, `a/b`). | Validate with a pure function **before any filesystem call**; then assert `path.relative(cwd, target)` is neither absolute nor starts with `..`. Zero writes on rejection. |
| 2 | **HIGH** | Destructive scaffolding (`fs.cp` with `force: true`, `rm -rf` of the target). | Acquire the target atomically; copy with `force: false, errorOnExist: true`; never touch a pre-existing entry. |
| 3 | **HIGH** | Cleanup that deletes more than it created — the classic generator footgun. **REVISED in round 2:** the round-1 contract ("remove only the files we wrote") was itself broken — it leaves `npm ci`'s `node_modules/` behind, so a pre-existing-directory retry hits exit 3 forever. | **Snapshot contract.** `target-dir.js` records the top-level entry-name set at acquisition (∅ when we created the dir; the benign dotfiles when it pre-existed). `cleanup.js` removes every top-level entry **not** in that snapshot, and removes the directory itself **only** if we created it. Synchronous fs only. Re-assert containment immediately before each `rmSync`. Never runs for validation/exit-3 failures (nothing was written). |
| 4 | **HIGH** | Shell string interpolation for the install step (`exec("npm ci " + dir)`) → command injection via the app name. | `spawn('npm', ['ci', ...], { cwd, shell: false, stdio: 'inherit' })`. Never `exec` with concatenation. Same for the Electron front-load (`spawn(process.execPath, [...])`). |
| 5 | **HIGH** | Copying `node_modules/` or `dist/` out of the template directory (likely, because regenerating the lockfile requires installing *inside* the template, and a local build leaves `dist/` there — both were present in my spike directory). Ships 774 MB and creates genuine cross-app shared state → breaks AC4. | Explicit skip list in `scaffold.js` + a root `.gitignore` covering `templates/*/node_modules` and `templates/*/dist` + a test asserting neither appears in a generated app. |
| 6 | **HIGH** | Leaking the template's own identity into generated apps, **or** the opposite failure: blind token replacement across a 300 KB JSON lockfile. | **No text substitution anywhere.** Exactly two JSON rewrites (`package.json:name`, `package-lock.json:name` + `packages[""].name`) via parse/set/stringify, plus the `_gitignore` rename. `index.html` ships **no `<title>`**; the window title comes from `app.getName()`. Tests assert the app name appears in exactly those two files and that `appgen-template` appears nowhere. |
| 7 | **HIGH** | "Optimising" per-app installs with npm workspaces, a shared `node_modules`, `file:` links, or symlinks — the obvious reaction to 774 MB per app, and a direct AC4 violation. | Prohibited. Independence test resolves every symlink in a generated app and asserts the realpath stays inside that app. |
| 8 | **MEDIUM-HIGH** | Floating dependency versions (see §2.5) — defeats the ticket's stated purpose of one shared look and feel. | Exact versions on direct deps **and** a committed lockfile installed with `npm ci`. |
| 9 | **MEDIUM-HIGH** | Classic Electron insecurity: `nodeIntegration: true` / `contextIsolation: false` / no CSP, often copy-pasted from old tutorials. Verified unnecessary here. | Safe defaults in the template + CSP meta tag; `loadFile` only, never a remote URL. |
| 10 | **MEDIUM** | Undocumented magic bundler config being "tidied away" by a later developer, silently breaking the build (shims in §2.3). | Each alias/define carries a comment naming the exact error it prevents. |
| 11 | **MEDIUM** | A test suite that installs 774 MB per case → slow, so it gets skipped, so the real behaviours stay untested. | Default suite runs with `--no-install` and no network; one opt-in e2e test does install + front-load + build + smoke. **It must fail, not skip, when explicitly requested and unable to run** (§8 concern 6). |
| 12 | **MEDIUM** | Template `package.json` drifting out of sync with the committed lockfile → **every** generation fails at `npm ci`. | Offline unit test comparing declared deps against the lockfile entries; regeneration recipe documented in the generator README. |
| 13 | **LOW-MEDIUM** | Symlinked template entries or a symlinked/file target path slipping past the emptiness check. | `lstat` after `mkdir` returns `EEXIST` (verified: `EEXIST` is returned for a directory, a file **and** a symlink alike, so `lstat` is mandatory to tell them apart); copy with `dereference: false`; test asserts the template tree contains no symlinks. |
| 14 | **MEDIUM** | **New (round 2).** A half-written target left behind by `Ctrl-C` during the multi-second, 774 MB install — the exact state the partial-failure criterion forbids. | SIGINT/SIGTERM handlers forward the signal to the child, then run the synchronous snapshot cleanup, then exit 130/143. State needed for cleanup is known *before* any write, so it is always available. `SIGKILL`/power loss is uncatchable and documented as such. |
| 15 | **MEDIUM** | **New (round 2).** Ownership inferred from a `stat` taken *before* `mkdir` (TOCTOU) — authorises a recursive delete of a directory the generator did not create. | Ownership comes from the atomic `mkdir(target, { recursive: false })` itself: success = we own it, `EEXIST` = it pre-existed. Verified: `recursive: true` does **not** throw on an existing directory and therefore cannot be used as the ownership signal. |

**Not applicable, stated explicitly so it is not silently skipped:** there is no database, no ORM,
no HTTP layer and no tenant table in this ticket, so N+1 queries, multi-tenant row scoping and
schema migrations have no literal counterpart. Their analogues are covered above: the "tenant" is
a generated app (isolation = finding 7), the "N+1" is the per-app install cost (accepted, finding
7), and the "migration" concern is that generated apps have **no** update/eject path — once
generated they never track template changes (out of scope; call it out in the README).

---

## 4. Shared services at risk

Nothing in this repo is shared yet (greenfield), so "shared service" means shared *host* state:

1. **The user's current working directory** — the generator writes a new directory into it. Guarded
   by containment assertions (findings 1-3) and by the atomic acquisition (finding 15).
2. **Global npm cache** (`~/.npm`, 3.3 GB here) and **global Electron binary cache**
   (`~/.cache/electron`, 427 MB here) — written by the install step for every generated app.
   Content-addressed, checksum-verified, shared by design. **This is why the proposed AC4 clause
   "writes nothing to global config or cache" cannot be met literally** if the generator installs;
   see §6.1.
3. **The AppGenerator repo itself** — generation must write nothing inside it. Cheap to prove:
   `git status --porcelain` is empty after generating two apps (asserted in the independence test,
   which generates into `os.tmpdir()`, never into the repo).
4. **`templates/electron-gluestack/`** — becomes shared infrastructure the moment a second target
   (React Native) is added. Keep generator core free of Electron specifics; everything
   Electron-shaped lives under that directory.

---

## 5. Implementation approach rationale

**Generator:** Node built-ins only — no runtime dependencies. `node:util.parseArgs` for flags,
`node:fs` / `node:fs/promises` for I/O, `node:child_process.spawn` for npm, `node:test` for tests.
A scaffolding tool whose own dependency tree can drift is self-defeating, and zero deps removes the
supply-chain surface entirely.

**Node floor is `>=22.12.0`, not a vague "LTS".** Verified from the registry: `electron@44.7.1`
declares `node >= 22.12.0`; `vite@7.3.7` and `@vitejs/plugin-react@5.2.0` declare
`^20.19.0 || >=22.12.0`. The binding constraint is Electron, so anything lower would let the
generator run on a host where the generated app cannot build. Declared in **both** manifests'
`engines.node`, enforced by an explicit check in `cli.js` (exit 2 with a clear message, because
`engines` only warns), and stated in both READMEs. Verified host: v22.20.0.

**Module split** mirrors the failure modes, so each blocked product decision lands in exactly one
small file and can be flipped in one place:

- `validate-app-name.js` — pure, table-driven, no I/O. Decision (3) = one regex + one test table.
- `target-dir.js` — resolve `path.join(cwd, appName)`, assert containment, then **acquire**:
  `mkdirSync(target, { recursive: false })`. Returns `{ target, createdByUs, snapshot }`. AC5 and
  the emptiness allowlist live here.
- `scaffold.js` — copy + the two JSON rewrites. Skip list, `dereference: false`, no text
  substitution at all.
- `install.js` — phase 1 `npm ci`, phase 2 Electron binary front-load. Decision (1) = the default
  of one flag. Explicit failure-mode map (§8 concern 5).
- `cleanup.js` — the only module allowed to delete; synchronous; snapshot-bounded.
- `errors.js` — typed error carrying a fixed exit code, so "clear message + stable exit code" is
  one mechanism rather than scattered `process.exit` calls.

**Order of operations** (this order is the security property, not an implementation detail):
Node floor check → parse args → validate name (pure, zero I/O) → resolve + containment →
**atomic acquire** → install signal handlers → scaffold → install phase 1 → install phase 2 →
print next steps.

**Exit codes** (documented in README, asserted in tests): `0` success, `2` usage/validation/Node
floor, `3` target not usable (non-empty, a file, a symlink), `4` scaffold failure, `5` install
failure, `130`/`143` interrupted by SIGINT/SIGTERM, `1` unexpected.

**Template:** exactly the configuration proven in §2, pinned to the exact versions tested, with a
committed lockfile. The placeholder screen imports **only** from `src/ui/index.jsx` — the single
seam where gluestack-ui is consumed. That satisfies the swappability criterion and is the thing
that makes the stand-in cheap to replace with the in-house library later; a test enforces it
statically so it cannot rot.

**Install default:** generation runs both install phases and prints next steps; `--no-install`
skips both (and the README then states that the first `npm start` downloads the Electron binary).
This makes AC1 ("runnable") true with no manual steps, keeps the fast test path offline, and
leaves the opposite reading one line away.

**Test working-directory convention (mandatory):** no test ever calls `process.chdir` — it is
process-global and unsafe under `node:test`'s parallelism. CLI tests
`spawn(process.execPath, [bin, name], { cwd: tmp })` with `tmp` from
`fs.mkdtemp(path.join(os.tmpdir(), 'appgen-'))`, removed in `t.after`. `target-dir.js` and
`scaffold.js` take an explicit `{ cwd }` parameter instead of reading `process.cwd()`, which is
what makes them unit-testable without chdir — and keeps every generated artifact out of this repo,
so the independence test's `git status --porcelain` assertion means something.

---

## 6. Risks and constraints

1. **AC4's "no global cache writes" clause is unsatisfiable as proposed** (evidence: `npm ci`
   populates `~/.npm`, and the Electron front-load populates `~/.cache/electron`). Recommend
   amending it to: *no shared **mutable app state** — each app owns its `node_modules`, no symlink
   or workspace link to the generator or a sibling, nothing written inside the AppGenerator repo,
   and no generated file naming another app; content-addressed, checksum-verified package/binary
   caches are shared immutable artifacts and are allowed.* Needs the ticket author's confirmation.
2. **Per-app `git init` is NOT implemented** — the TaskSpec explicitly leaves per-app git history
   unconfirmed. Deliberately omitted rather than guessed; ~3 lines to add once confirmed.
3. **The chosen gluestack line is a maintenance dead end.** `@gluestack-ui/themed@1.1.73` last
   published 2025-09-10 (~13 months stale) and the maintained v5 line is nativewind/Metro-only
   (§2.1). Mitigated by the `src/ui/` seam and by the ticket's own statement that gluestack-ui is a
   temporary stand-in — but the human should know the proof of concept rides a frozen line.
4. **Measured security consequence of that frozen line.** `npm audit` on the generated tree:
   **22 advisories — 15 high, 7 moderate, 0 critical**, and `--omit=dev` changes **nothing** (all
   are prod-declared). Chain: `@gluestack-ui/themed → @legendapp/motion → nativewind →
   react-native-css-interop → tailwindcss / react-native → metro → micromatch → braces`. Note the
   irony: the legacy line pulls nativewind in transitively anyway. **None** of those packages is
   imported by the placeholder app, so none reaches the Vite renderer bundle — they are build-time
   tooling that the graph declares as runtime deps. Generated apps nonetheless inherit the tree and
   have no update path. `npm audit fix` is **prohibited** (it unpins and defeats reproducibility).
   Record the numbers in the README and re-check them whenever the template lockfile is regenerated.
5. **Peer-dependency warnings are expected and must not be treated as failure.**
   `@react-native-aria/*` pulls `@react-aria/checkbox@3.2.1`, which peers React 16/17 against our
   React 19; npm emits `ERESOLVE overriding peer dependency` **warnings** and resolves them
   (nested). Install exits 0 and the app renders. A future npm that makes strict peers the default
   would break this — the committed lockfile is the hedge.
6. **Headless CI is not proven on this host.** `xvfb-run` is absent; the smoke launch was verified
   against `DISPLAY=:1`. Round-2 decision: the e2e test **skips when not requested** but
   **fails loudly when explicitly requested and unable to run**, so the AC1/AC2/AC3 proof can never
   evaporate into a silent skip. CI wiring is out of scope per the TaskSpec.
7. **774 MB and up to two network round trips per generated app** (registry + Electron binary).
   Inherent to AC4 independence. Must not be optimised away (finding 7). `--no-install` is the
   escape hatch for bulk/offline use.
8. **Bundle size warning** from Vite (~750 kB chunk). Expected for react-native-web + gluestack;
   code splitting is not in scope and the warning is not an error.
9. **Lockfile/manifest drift breaks every generation** (finding 12) — guarded by an offline test.
10. **Linux only.** macOS/Windows unverified; `npm` is `npm.cmd` on Windows and the `smoke` script
    uses POSIX env syntax. Declared in `engines`/README, matching the TaskSpec's out-of-scope list.
11. **Concurrent runs with the same app name in the same directory are unsupported** — stated
    rather than glossed. Worst case, precisely: the second run sees `EEXIST` on a still-empty
    directory, treats it as pre-existing, and both runs write into it. Nothing **outside** the
    target is ever at risk, and the loser never deletes the winner's directory (it does not own
    it). No lock file is added: a stale lock after `SIGKILL` would block every retry, which is
    worse than the race it prevents.
12. **`SIGKILL` / power loss cannot be cleaned up.** Residue is possible; recovery is the exit-3
    message, which names the offending path and tells the user to remove it or choose another name.
13. **Four ACs remain blocked on product decisions.** The plan implements the TaskSpec's proposed
    defaults and isolates each one, but "done" is not definable until they are confirmed.

---

## 7. Scope discipline

Deliberately **not** built, despite being tempting: TypeScript in the template, ESLint/Prettier,
a Vite dev server / HMR, a `--template` flag (directory isolation is enough), `--version`, an
Electron `preload.cjs` (unnecessary with no IPC — documented as the extension point instead),
`electron-builder` packaging, CI workflow files, interactive prompts, a lock file for concurrent
runs, an `npm audit` gate (network), and any update/eject path for already-generated apps.

Deliberately **retained** despite being extra: the Electron binary front-load (without it
"installed" does not mean "runnable"), and the `SMOKE_TEST=1` branch shipped inside the generated
app (it is the AC2 proof mechanism, env-gated, zero runtime cost — and it must carry a comment
naming the e2e test that depends on it so it is not "cleaned up").

---

## 8. Round-2 review resolutions

Every concern raised in review, with its decision. Ratings as received.

| # | Concern | Decision |
| --- | --- | --- |
| 1 | **HIGH** Retry after a failed install into a **pre-existing** empty directory is unrecoverable: cleanup removes "only the files we wrote", but `npm ci` created `node_modules/`. | **Accepted — root cause confirmed** (verified: `npm ci` creates `node_modules` with 324 top-level entries; it does **not** rewrite the lockfile). Round-1 contract replaced with the **snapshot contract** (finding 3). New test: pre-existing empty dir + install failure → retry exits 0, and a pre-existing `.git` directory survives both runs. |
| 2 | **HIGH** No signal handling; `Ctrl-C` during the multi-second install leaves the forbidden half-written directory, and the in-memory "created paths" list dies with the process. | **In scope.** Handlers installed immediately after acquisition: forward the signal to the child, wait bounded then `SIGKILL`, run the **synchronous** snapshot cleanup, exit 130/143. The snapshot approach also removes the fragility the concern names — cleanup state is known *before* the first write, not accumulated during it. `SIGKILL`/power loss documented as uncatchable (risk 12). New test drives it through an `APPGEN_NPM_BIN` test seam. |
| 3 | **HIGH** TOCTOU between the emptiness check, `mkdir`, and the ownership flag that authorises recursive delete; ownership should come from an atomic `mkdir` (EEXIST), not a prior `stat`. | **Accepted, implemented exactly as suggested** (finding 15). Verified semantics: `recursive: false` → `EEXIST` on second call; `recursive: true` → **no throw**, so it cannot be the signal; `EEXIST` is also returned for a **file** and a **symlink**, so `lstat` remains mandatory; missing parent → `ENOENT` → exit 2. Residual same-name-concurrency window documented in risk 11 rather than glossed. |
| 4 | **HIGH** `engines.node` has no number; declaring 18/20 would let the generator run where the app cannot build. | **Fixed with verified numbers:** floor is **`>=22.12.0`** (electron@44.7.1 `node >= 22.12.0`; vite@7.3.7 and @vitejs/plugin-react@5.2.0 `^20.19.0 \|\| >=22.12.0`). Declared in both manifests, enforced in `cli.js` (exit 2), documented in both READMEs. |
| 5 | **MEDIUM** `spawn` failure modes other than non-zero exit are unmapped (ENOENT, proxy/offline, ENOSPC, killed-by-signal), and it is unclear when cleanup runs. | **Explicit map** (§5 + plan): `error` event `ENOENT` → exit 5, "npm not found on PATH; install Node/npm or re-run with `--no-install`" (verified: the `error` event fires and `exit` never does); other `error` codes → exit 5 naming the code; npm non-zero (registry/proxy/ENOSPC/ERESOLVE) → exit 5, npm's own output already on the terminal via inherited stdio; npm killed by a signal → verified `code === null` + `signal` set, so it is mapped from `signal`, not from `code !== 0`. Cleanup runs for **every** failure after acquisition (4, 5, 130, 143) and **never** for 2 or 3 (nothing was written). A cleanup failure never masks the original error: both are printed, the original exit code wins. |
| 6 | **MEDIUM** The AC1/AC2/AC3 proof can silently never run: opt-in **and** skips when no display/xvfb. | **Fixed:** unset → skip with a one-line reason; `APPGEN_E2E=1` **set** and no `DISPLAY`/`WAYLAND_DISPLAY` and no `xvfb-run` → **fail**, naming the requirement. Plus a `test:e2e` script and the exact manual fallback command in the README. |
| 7 | **MEDIUM** The smoke assertion's scope is ambiguous: zero-console-errors is host-dependent, but the CSP rationale depends on it. | **Pinned, and a real bug found while pinning.** Asserted: window created; `#root` non-empty; placeholder text; gluestack component by `data-testid`; injected `<style>` count > 0; and page errors collected via `on('console-message', d => d.level === 'error')` — **`level === 'error'` only, never warnings**, DevTools never opened, **process stderr never asserted**. The bug: my spike used the deprecated positional signature; against Electron 44's `electron.d.ts` the supported shape is an event object with a **string** level (§2.4), so a numeric test would silently collect nothing. This is also the one assertion flagged as relaxable if another host proves flaky. |
| 8 | **MEDIUM** Substitution rules are internally contradictory (JSON rewrite vs "text-extension allowlist") — an implementer will reintroduce blind replacement. | **Resolved by removing the mechanism: no text substitution anywhere.** Exactly two JSON rewrites plus the `_gitignore` rename (finding 6). Consequences, each verified: `index.html` ships **no `<title>`** (my spike's `<title>probe</title>` was precisely this leak); the window title comes from `app.getName()`, documented as the package.json `name`; the template must **not** set `productName`, which Electron prefers over `name`; the generated README uses generic wording. JSON written 2-space + trailing newline. |
| 9 | **MEDIUM** Containment is stricter than any AC requires, and tests would otherwise generate inside the repo. | **Clarified, not loosened.** The generator creates `path.join(cwd, appName)` — a single segment in the cwd — which is the direct consequence of the name-validation decision (no separators, no `..`, no absolute paths), not a second rule. The containment assertion is defence-in-depth before any `rm`. If the author wants `appgenerator ../some/where/app`, that is a change to **blocked decision 3** and both change together. Test cwd convention written down in §5 (no `chdir`; `spawn` with `cwd`; injected `{ cwd }` for unit tests). |
| 10 | **MEDIUM** `npm ci` is not the only network dependency: electron's postinstall downloads ~98 MB unpinned and unchecksummed; proxy/`ELECTRON_MIRROR`/poisoned cache unspecified. | **Investigated — the premise is wrong, and the correction changes the plan** (§2.6). Electron 44 has **no postinstall**; `npm ci` fetches **no** binary. The download is **lazy** at first `require('electron')`, is **283 MB**, and **is** checksum-verified against `checksums.json` **bundled in the lockfile-pinned tarball** (`@electron/get@5.1.0` → `sumchecker@3.0.1`), so a poisoned/partial cache fails loudly. Plan gains install **phase 2** (front-load; idempotent, 54 ms warm) so "installed" means "runnable offline". Mirror/proxy/cache env vars pass through inherited env and are documented. Binary-download failure is the same code path as a registry failure (npm/child non-zero → exit 5 → cleanup), so it is documented rather than separately simulated. |
| 11 | **LOW** The frozen 545-package tree's security consequence for every generated app is not stated. | **Measured and surfaced** (risk 4): 22 advisories, **15 high**, 0 critical; `--omit=dev` changes nothing; chain traced; none reachable in the shipped renderer bundle; `npm audit fix` prohibited; numbers recorded in the README and re-checked on every lockfile regeneration. |
| 12 | **LOW** The generated app permanently ships generator test machinery. | **Kept, with the reason written where it will be read:** a comment in `electron/main.cjs` naming the e2e test that depends on the `SMOKE_TEST=1` branch, plus a generated-README line presenting `npm run smoke` as a self-check. Env-gated, `show: !SMOKE`, zero runtime cost. |
