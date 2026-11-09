// Dev server (esbuild, live rebuild) or `--preview` of dist/.
// HTTPS: if certs/cert.pem and certs/key.pem exist, the server uses HTTPS (needed for WebXR on a headset over Wi-Fi).
import * as esbuild from 'esbuild';
import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { networkInterfaces } from 'node:os';

const preview = process.argv.includes('--preview');
const port = Number(process.env.PORT || 5173);
const https = existsSync('certs/cert.pem') && existsSync('certs/key.pem');
const tls = https ? { certfile: 'certs/cert.pem', keyfile: 'certs/key.pem' } : {};

if (!preview) {
  mkdirSync('dist', { recursive: true });
  cpSync('public', 'dist', { recursive: true });
}
const ctx = await esbuild.context(
  preview
    ? { entryPoints: [], write: false }
    : { entryPoints: ['src/main.ts'], bundle: true, sourcemap: true, format: 'iife', outfile: 'dist/main.js', logLevel: 'info' },
);
if (!preview) await ctx.watch();
const { port: actual } = await ctx.serve({ servedir: 'dist', host: '0.0.0.0', port, ...tls });
const scheme = https ? 'https' : 'http';
console.log(`\nChelsea Mini City ${preview ? 'preview' : 'dev server'}:`);
console.log(`  Local:   ${scheme}://localhost:${actual}/`);
for (const list of Object.values(networkInterfaces())) {
  for (const a of list ?? []) if (a.family === 'IPv4' && !a.internal) console.log(`  Network: ${scheme}://${a.address}:${actual}/`);
}
if (!https) console.log('  (HTTP only — VR on a headset needs HTTPS. See README "Opening it on Quest 3".)');
