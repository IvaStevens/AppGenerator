import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  // Relative asset URLs are required for Electron's win.loadFile(), which
  // loads the built index.html from the local filesystem (no server root).
  base: "./",
  plugins: [react()],
  resolve: {
    alias: {
      // gluestack-ui / react-native-svg import the bare "react-native"
      // specifier. There is no React Native runtime in an Electron
      // renderer, so every such import is redirected to react-native-web.
      "react-native$": "react-native-web",
      "react-native/": "react-native-web/",

      // react-native-svg's fetchData.js imports the Node builtin "buffer".
      // That builtin does not exist in a Vite-bundled browser context, so
      // it must be aliased to the npm polyfill package of the same name.
      buffer: "buffer/",

      // react-native-svg imports @react-native/assets-registry/registry.
      // The real package (v0.87.1+) now re-exports from "react-native"
      // itself, which Rollup cannot resolve in a web bundle - installing
      // it does NOT fix this. Alias it to a tiny local no-op stub instead.
      "@react-native/assets-registry/registry": path.resolve(
        __dirname,
        "shims/assets-registry.js",
      ),
    },
    // .web.* variants must resolve BEFORE the plain extensions - this is
    // how react-native-svg and friends pick their web implementation
    // instead of a native one.
    extensions: [
      ".web.js",
      ".web.jsx",
      ".web.ts",
      ".web.tsx",
      ".js",
      ".jsx",
      ".ts",
      ".tsx",
      ".json",
    ],
  },
  define: {
    // react-native-web expects a browser-style "global".
    global: "window",
    // Several RN-derived packages branch on __DEV__ at module-eval time.
    __DEV__: JSON.stringify(process.env.NODE_ENV !== "production"),
    "process.env.NODE_ENV": JSON.stringify(process.env.NODE_ENV || "production"),
  },
  optimizeDeps: {
    esbuildOptions: {
      // Keep the same global shim consistent during dependency pre-bundling.
      define: { global: "window" },
    },
  },
});
