// Load-bearing stub for @react-native/assets-registry/registry.
//
// react-native-svg imports this module. The real npm package (v0.87.1+) now
// re-exports from "react-native" itself, which Rollup cannot resolve in a
// web bundle - installing it does NOT fix the build. This Electron
// renderer never loads native image assets via the RN asset pipeline, so
// no-op stubs are sufficient.

let nextId = 1;
const registry = new Map();

export function registerAsset(asset) {
  const id = nextId++;
  registry.set(id, asset);
  return id;
}

export function getAssetByID(id) {
  return registry.get(id);
}

export default { registerAsset, getAssetByID };
