/**
 * Patch script to replace native binaries with WASM fallbacks.
 *
 * This is needed on environments where Application Control policies
 * block native .node binaries (e.g., corporate Windows machines).
 *
 * Run after `npm install`:
 *   node scripts/patch-native-wasm.js
 *
 * What it does:
 * 1. Replaces rollup's native.js with @rollup/wasm-node's native.js
 * 2. Replaces esbuild's lib/main.js and bin/esbuild with esbuild-wasm equivalents
 *
 * Prerequisites (already in devDependencies):
 *   - @rollup/wasm-node
 *   - esbuild-wasm
 */

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const nm = path.join(root, 'node_modules');

function copyFile(src, dest) {
  if (!fs.existsSync(src)) {
    console.warn(`  SKIP: ${src} not found`);
    return false;
  }
  fs.copyFileSync(src, dest);
  console.log(`  OK: ${path.relative(nm, dest)}`);
  return true;
}

function copyDir(src, dest) {
  if (!fs.existsSync(src)) {
    console.warn(`  SKIP: ${src} not found`);
    return false;
  }
  fs.cpSync(src, dest, { recursive: true, force: true });
  console.log(`  OK: ${path.relative(nm, dest)}/`);
  return true;
}

console.log('Patching rollup → @rollup/wasm-node ...');
copyFile(
  path.join(nm, '@rollup/wasm-node/dist/native.js'),
  path.join(nm, 'rollup/dist/native.js'),
);
copyDir(
  path.join(nm, '@rollup/wasm-node/dist/wasm-node'),
  path.join(nm, 'rollup/dist/wasm-node'),
);

console.log('Patching esbuild → esbuild-wasm ...');
copyFile(
  path.join(nm, 'esbuild-wasm/lib/main.js'),
  path.join(nm, 'esbuild/lib/main.js'),
);
copyFile(
  path.join(nm, 'esbuild-wasm/bin/esbuild'),
  path.join(nm, 'esbuild/bin/esbuild'),
);
copyFile(
  path.join(nm, 'esbuild-wasm/esbuild.wasm'),
  path.join(nm, 'esbuild/esbuild.wasm'),
);
copyFile(
  path.join(nm, 'esbuild-wasm/wasm_exec.js'),
  path.join(nm, 'esbuild/wasm_exec.js'),
);
copyFile(
  path.join(nm, 'esbuild-wasm/wasm_exec_node.js'),
  path.join(nm, 'esbuild/wasm_exec_node.js'),
);

console.log('Done. Native binaries patched with WASM fallbacks.');
