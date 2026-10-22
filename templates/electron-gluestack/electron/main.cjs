// Main process. Safe Electron defaults verified compatible with
// gluestack-ui: contextIsolation:true, nodeIntegration:false. Always
// loadFile from the local dist/ build - never a remote URL. DevTools are
// never opened.
//
// The window title is app.getName(), which reads this app's own
// package.json "name" field (Electron prefers "productName" when present,
// so the template must not set it) - this is the zero-text-substitution
// mechanism for showing the app's name in its own window.
//
// NOTE: the SMOKE_TEST=1 branch below is the automated proof mechanism for
// AC2 ("launches a window showing a placeholder screen") and AC3 ("renders
// at least one gluestack-ui component"), exercised by
// test/e2e/full-generate.test.js in the AppGenerator repo (and by this
// app's own `npm run smoke`). Do not remove it as "unused test code" - it
// is the thing the acceptance proof depends on.

const { app, BrowserWindow } = require("electron");
const path = require("node:path");

const SMOKE = process.env.SMOKE_TEST === "1";

function createWindow() {
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    show: !SMOKE,
    title: app.getName(),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  const consoleErrors = [];
  // Modern, non-deprecated signature: a single event-object argument whose
  // level is the string union 'info' | 'warning' | 'error' | 'debug'. The
  // older positional (event, level, message) signature still fires in
  // Electron 44 but is marked @deprecated and is removed in a later major;
  // a numeric comparison against that positional "level" would silently
  // collect nothing today. Only page-level errors are collected here -
  // never process stderr, which carries unrelated platform/GPU noise.
  win.webContents.on("console-message", (details) => {
    if (details.level === "error") {
      consoleErrors.push(details.message);
    }
  });

  win.loadFile(path.join(__dirname, "..", "dist", "index.html"));

  if (SMOKE) {
    win.webContents.once("did-finish-load", async () => {
      try {
        const result = await win.webContents.executeJavaScript(`
          (function () {
            const root = document.getElementById('root');
            const screen = document.querySelector('[data-testid="placeholder-screen"]');
            const button = document.querySelector('[data-testid="placeholder-button"]');
            const styleTags = document.querySelectorAll('style').length;
            return {
              hasRoot: !!root && root.childElementCount > 0,
              hasScreen: !!screen,
              hasButton: !!button,
              text: root ? root.textContent : '',
              styleTags,
            };
          })();
        `);

        const ok =
          result.hasRoot &&
          result.hasScreen &&
          result.hasButton &&
          result.styleTags > 0 &&
          consoleErrors.length === 0;

        process.stdout.write(`SMOKE_RESULT=${JSON.stringify(result)}\n`);
        process.stdout.write(`CONSOLE_ERRORS=${JSON.stringify(consoleErrors)}\n`);

        app.exit(ok ? 0 : 1);
      } catch (err) {
        process.stdout.write(`SMOKE_ERROR=${err.message}\n`);
        app.exit(1);
      }
    });
  }
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  app.quit();
});
