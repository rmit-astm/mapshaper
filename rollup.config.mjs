import { nodeResolve } from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import json from '@rollup/plugin-json';
import nodePolyfills from 'rollup-plugin-polyfill-node';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const onBundle = {
  name: 'onbundle',
  writeBundle() {
    // copy mapshaper.js to www/
    const src = path.join(__dirname, 'mapshaper.js');
    const dest = path.join(__dirname, 'www/mapshaper.js');
    fs.writeFileSync(dest, fs.readFileSync(src));
  }
};

// rollup-plugin-polyfill-node injects the build machine's absolute path as
// __filename/__dirname. That makes builds non-reproducible and leaks a local
// path into the public bundle. mproj only uses it for a Node-only nad lookup;
// the browser bundle is not affected, so replace it with a stable value.
const stableNodePaths = {
  name: 'stable-node-paths',
  renderChunk(code) {
    return code.replace(
      /(var __(?:filename|dirname)(?:\$\d+)?\s*=\s*)['"][^'"]*['"]/g,
      (match, prefix) => `${prefix}'/mapshaper'`
    );
  }
};

export default [{
  treeshake: false,
  input: 'src/gui/gui.mjs',
  output: [{
    strict: false,
    format: 'iife',
    file: 'www/mapshaper-gui.js'
  }]
}, {
  treeshake: false,
  input: 'src/mapshaper-gui-modules.mjs',
  output: {
    file: 'www/modules.js',
    format: 'iife',
    name: 'modules' // Global variable name when loaded via script tag
  },
  plugins: [
    nodeResolve({
      browser: true, // Use browser versions of packages when available
      preferBuiltins: false
    }),
    commonjs(),
    json(),
    nodePolyfills(),
    stableNodePaths
  ]
}, {
  treeshake: true,
  context: 'null', // prevent a Rollup warning from msgpack
  input: 'src/mapshaper.mjs',
  output: [{
    strict: false,
    format: 'iife',
    file: 'mapshaper.js'
  }],
  plugins: [onBundle, nodeResolve(), json()]
}];
