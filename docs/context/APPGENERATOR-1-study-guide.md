# Study Guide — APPGENERATOR-1 (Generate an empty Electron app with gluestack-ui)

Patterns worth naming from the Architect's plan and the Developer's implementation.
Scope: the generator core (`src/`), its tests, and the template's name-binding
decision. Not a review — nothing here is about correctness or style.

---

## 1. TOCTOU-free resource acquisition (ownership from the syscall)

*What we did:* `acquireTargetDir` calls `mkdirSync(target, { recursive: false })`
and treats the call's own outcome as the ownership signal — success means the
generator created the directory, `EEXIST` means it pre-existed — then `lstat`s
on `EEXIST` to distinguish directory from file from symlink.

*What it is:* Time-of-check-to-time-of-use (TOCTOU) is the class of race where
you `stat` a path, decide what to do, and act — by which point another process
may have changed the path. The fix is to let a single atomic syscall both act
and report: non-recursive `mkdir` either creates the entry or fails with
`EEXIST`, and that result cannot be stale. `recursive: true` is unusable for
this because it succeeds silently on an existing directory and therefore
carries no information. `EEXIST` is returned identically for a directory, a
plain file, and a symlink, so a follow-up `lstat` (not `stat`, which follows
links) is still mandatory to classify what is there.

*Why this over alternatives:* The obvious version is `if (existsSync(target))
{ ...check empty... } else { mkdirSync(target) }`, which reads naturally and is
wrong in two ways: another process can create the path in the gap, and the
"did I create it?" fact gets inferred from a prior observation rather than from
the create itself. That inference is what the whole cleanup contract rests on,
so it has to be unforgeable. You would reach for check-then-act only when
nothing destructive depends on the answer — here a wrong answer means deleting
a directory the generator did not create.

*Where:* `src/target-dir.js:43` (acquire), `src/target-dir.js:60` (classify)

---

## 2. Snapshot-bounded cleanup (set difference as an ownership ledger)

*What we did:* Acquisition returns `{ target, createdByUs, snapshot }` where
`snapshot` is the set of top-level entry names present at the moment of
acquisition; cleanup removes every top-level entry *not* in that set, and
removes the directory itself only when `createdByUs`.

*What it is:* Rather than tracking what you wrote (a growing ledger, accumulated
during the risky phase), you record the world's state once *before* the first
write and define "mine" as the complement. Teardown is then a set difference
computed against information that was complete before anything could go wrong.
Crucially this also captures side effects the generator never performed itself —
`npm ci` creates ~324 top-level entries under `node_modules/` that no line of
generator code wrote.

*Why this over alternatives:* The intuitive design — and the plan's own round-1
design — is "remove only the paths we created". It fails exactly where it
matters: after a failed install into a *pre-existing* empty directory it leaves
`node_modules/` behind, so the directory is now non-empty and every retry
returns exit 3 forever. A write-tracking ledger also has to be mutated on the
hot path, which is the thing most likely to be interrupted. Per-path tracking is
the right call when you are writing into a directory you *don't* control and
can't define a boundary for; here AC5 guarantees the directory was empty (or
benign dotfiles only), which is precisely what makes the complement safe.

Note the layered guard: containment (`path.relative(cwd, target)` is neither
absolute nor `..`-prefixed) is asserted at acquisition *and* re-asserted inside
cleanup immediately before each `rmSync`. That is **defense in depth** —
the second check is unreachable if the first is correct, and it is there because
the blast radius of being wrong is a recursive delete driven by user input.

*Where:* `src/target-dir.js:83` (snapshot), `src/cleanup.js:54` (set
difference), `src/cleanup.js:35` and `src/cleanup.js:59` (containment
re-assertion)

---

## 3. Cooperative cancellation with interruption checkpoints

*What we did:* SIGINT/SIGTERM set an `interrupted` flag and forward the signal
to the in-flight child (bounded 3s wait, then SIGKILL); the orchestrator then
re-checks that flag at every `await` boundary — after scaffold, between install
phase 1 and phase 2, and after install — and unwinds through one
`finishInterrupted()` path.

*What it is:* Cooperative (as opposed to preemptive) cancellation: the signal
does not abort work, it records intent, and the work checks for that intent at
known-safe points. The checkpoint placement is the design: JavaScript is
single-threaded, so a signal cannot land mid-`scaffold()`; it can only land at
a yield point, which is exactly where the checks are. `install.js` nulls the
caller's child reference the instant a child settles, so the orchestrator can
tell "a child is running, forward to it" from "no child, unwind now" instead of
waiting out a 3s timer against an already-dead process.

*Why this over alternatives:* The obvious handler is `process.on('SIGINT', () =>
{ cleanup(); process.exit(130) })`. Two problems. `process.exit` inside a
handler truncates anything in flight and skips the normal error-mapping path,
so the exit-code table stops being a single source of truth. And an *async*
cleanup in a handler can be cut short when the event loop stops — which is why
`cleanup.js` is synchronous-only: it runs at most once at process end, so sync
I/O costs nothing and removes that failure mode entirely. An `AbortController`
threaded through would be the idiomatic alternative and is better when many
independent async operations need cancelling; here there is exactly one child
at a time, so a flag plus a child reference is less machinery for the same
guarantee.

Also worth naming: signal handlers are **re-entrant**. A second Ctrl-C arrives
while cleanup is synchronously deleting up to 774 MB, so `cleanup()` carries a
`cleaningUp` guard flag (ignore, don't race) and prints `cleaning up <path>` so
the delay reads as progress rather than a hang.

*Where:* `src/cli.js:116` (handler), `src/cli.js:136` (single unwind path),
`src/cli.js:153` and `src/install.js:99` (checkpoints), `src/install.js:53`
(child-reference clearing), `src/cleanup.js:25` (re-entrancy guard)

---

## 4. Late binding instead of template substitution

*What we did:* The app name is written in exactly two places — `package.json`
and `package-lock.json`, via JSON parse/mutate/stringify — and nothing else.
The generated app's window title comes from `app.getName()` at runtime; the
template's `index.html` deliberately ships no `<title>` element.

*What it is:* Instead of a build-time token-replacement pass over the template
tree (`{{APP_NAME}}` → value), the name is bound once in structured data and
read dynamically wherever it is needed. Mutating parsed JSON also means the
rewrite can never corrupt an unrelated string that happens to match, and it
sidesteps the entire question of which files are "text" and safe to scan.

*Why this over alternatives:* Token substitution across a file-extension
allowlist is the standard scaffolder approach and was the plan's round-1 design.
It was deleted because every substitution site is a place the template identity
can leak (the spike's `<title>probe</title>` was exactly that leak) and because
the allowlist itself is a maintenance liability — add a file type, forget to
list it, ship a stale name. The price is real: the template cannot express the
name anywhere a runtime lookup is impossible, which is why `productName` is
forbidden in the template manifest (Electron prefers it over `name`, which
would silently break `app.getName()`). Reach for substitution when the target
genuinely has no runtime to read from — static site templates, Dockerfiles,
CI YAML.

*Where:* `src/scaffold.js:45` (the only two rewrites),
`templates/electron-gluestack/electron/main.cjs:28` (runtime read),
`templates/electron-gluestack/index.html:6` (documented absence)

---

## 5. Architectural fitness function (boundary enforced by a test)

*What we did:* `test/scaffold.test.js` walks the generated `src/` tree and
asserts that no file outside `src/ui/` imports `@gluestack-ui/*` or
`react-native` directly. A sibling assertion checks the app name appears in
exactly two files and that `appgen-template` appears nowhere.

*What it is:* An architectural fitness function — an automated test whose
subject is a structural property of the codebase rather than its behaviour
(ArchUnit in Java, dependency-cruiser in JS, import-linter in Python, all the
same idea). Here it makes the `src/ui/` adapter seam — an **anti-corruption
layer** around a dependency the ticket explicitly calls temporary — a checked
invariant instead of a convention.

*Why this over alternatives:* The alternative is a README line saying "import UI
components only from `src/ui`", which decays the first time someone is in a
hurry, and the decay is invisible until the swap is attempted and turns out to
touch 40 files. A lint rule (`no-restricted-imports`) would be the other
natural home and is better when you want editor-time feedback; it was skipped
here because the generator ships zero runtime dependencies and the property
needs checking on the *generated* tree, which no linter in this repo sees. The
test also doubles as the only executable proof that the proof-of-concept proves
what it exists to prove — swappability.

*Where:* `test/scaffold.test.js:158`

---

## 6. Seam injection: replacing ambient process state with passed-in capability

*What we did:* Two related moves. `run()`, `acquireTargetDir()` and
`scaffold()` take an injected `{ cwd }` and never read `process.cwd()`. And the
npm binary is resolved through one internal helper honouring `APPGEN_NPM_BIN`,
which `test/fixtures/fake-npm.js` substitutes to exercise install success,
failure, and signal paths.

*What it is:* `process.cwd()` and `PATH` lookups are *ambient* — global,
implicit, and process-wide. Passing the working directory in makes it a
parameter; routing the child command through one resolver makes the process
boundary a **seam** (Feathers' term: a place where behaviour can be changed
without editing the code at that place). The second one is a test double that
lives in a different process — the only kind available when the thing under
test is `spawn()` semantics.

*Why this over alternatives:* The ambient version is `process.chdir(tmp)` in
each test, which is a process-global mutation and therefore unsafe under
`node:test`'s parallel execution — tests would corrupt each other's notion of
"here" nondeterministically. Injecting `cwd` also makes the independence test's
`git status --porcelain` assertion meaningful: every artifact lands in
`os.tmpdir()`, so a dirty repo afterwards is a real finding. For the npm seam,
the alternatives were mocking `child_process` (can't — the point is to test the
real spawn contract: `error`-with-ENOENT fires and `exit` never does; a
signalled child reports `code === null` plus a signal) or running real installs
(774 MB and a network per case). The fixture gets the real syscall semantics in
milliseconds. The tradeoff: an env var is a seam someone may mistake for a
feature, which is why it is documented as internal.

*Where:* `src/install.js:33` (resolver), `test/fixtures/fake-npm.js` (double),
`src/cli.js:68` and `src/target-dir.js:32` (injected `cwd`),
`test/independence.test.js:92` (why it pays off)

---

## 7. Front-loading a lazy side effect (and failing open when it is absent)

*What we did:* Install is two phases: `npm ci`, then a deliberate
`spawn(process.execPath, [node_modules/electron/install.js])` to pull the
283 MB Electron binary — skipped silently when that path does not exist.

*What it is:* `electron` has no `postinstall`; the binary is fetched lazily on
first `require('electron')`. Phase 2 eagerly materialises that cache so the
observable state "installed" actually means "runnable offline". The operation is
idempotent (~54 ms warm) because it checks the content-addressed cache first,
which is what makes an unconditional extra phase cheap rather than wasteful.

*Why this over alternatives:* Leaving it lazy is less code and is what you get
for free — but then AC1's "runnable with no manual steps" quietly means "plus a
283 MB download on first launch", and the e2e test's timing becomes
nondeterministic (cold vs warm cache). The cost is one more network dependency
inside the generator's failure window, which is deliberately mapped to the same
path as a registry failure: exit 5, then snapshot cleanup. The `existsSync`
guard is graceful degradation at a deliberately chosen granularity — a future
non-Electron template skips the phase instead of hard-failing on a missing file.
You would leave the lazy behaviour alone if "installed" never had to mean
"offline-ready", e.g. a dev-only tool that always has the network.

*Where:* `src/install.js:103`

---

## Deliberately not included

- Typed error classes carrying exit codes (`src/errors.js`) — a clean single
  mapping point, but a pattern most developers recognise on sight.
- `npm ci` + committed lockfile for reproducibility — correct and load-bearing
  here (`@gluestack-ui/themed` declares floating `latest` transitives, which
  exact pins on direct deps cannot constrain), but standard practice.
- The three Vite shims (react-native-web alias, assets-registry stub, buffer
  polyfill) — load-bearing and well commented, but ecosystem workarounds rather
  than transferable concepts.
