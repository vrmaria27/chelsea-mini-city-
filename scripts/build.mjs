// Production build: bundles src/main.ts and copies static files to dist/ (relative paths, so any static host/subpath works).
import { build } from 'esbuild';
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';

rmSync('dist', { recursive: true, force: true });
mkdirSync('dist', { recursive: true });
cpSync('public', 'dist', { recursive: true });
const result = await build({
  entryPoints: ['src/main.ts'],
  bundle: true,
  minify: true,
  sourcemap: true,
  format: 'iife',
  target: ['es2020', 'chrome100', 'safari15', 'firefox100'],
  outfile: 'dist/main.js',
  metafile: true,
  logLevel: 'info',
});
writeFileSync('dist/.nojekyll', '');
const bytes = Object.values(result.metafile.outputs).reduce((n, o) => n + o.bytes, 0);
console.log(`Built dist/ (${(bytes / 1024).toFixed(1)} KiB incl. source map)`);
