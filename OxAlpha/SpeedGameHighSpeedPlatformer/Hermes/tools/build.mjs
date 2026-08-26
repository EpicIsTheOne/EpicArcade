import * as esbuild from 'esbuild';
import { fileURLToPath } from 'url';
import path from 'path';

const root = path.dirname(fileURLToPath(import.meta.url)) + '/..';

await esbuild.build({
  entryPoints: [path.join(root, 'src/main.js')],
  bundle: true,
  format: 'iife',
  outfile: path.join(root, 'public/app.js'),
  sourcemap: 'inline',
  logLevel: 'info',
  target: ['chrome110'],
  alias: {
    'three/addons': path.join(root, 'node_modules/three/examples/jsm'),
  },
});
console.log('build ok');
