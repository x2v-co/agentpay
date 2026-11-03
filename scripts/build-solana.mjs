import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { copyFileSync, mkdirSync } from 'node:fs';
import { build } from 'esbuild';
const require = createRequire(import.meta.url);
execFileSync(process.execPath, [require.resolve('typescript/bin/tsc'), '-p', 'tsconfig.solana.json', '--noEmit', 'false', '--outDir', 'dist/solana'], { stdio: 'inherit' });
mkdirSync('dist/solana/apps/solana-demo', { recursive: true });
for (const file of ['site.css', 'site-interactions.js', 'judge-public.js', 'judge.html', 'index.html', 'wallet.html', 'style.css', 'app.js']) copyFileSync(`apps/solana-demo/${file}`, `dist/solana/apps/solana-demo/${file}`);
await build({ entryPoints: ['apps/solana-demo/wallet.ts'], bundle: true, platform: 'browser', target: 'es2022', format: 'iife', minify: true, outfile: 'dist/solana/apps/solana-demo/wallet.bundle.js', define: { 'process.env.NODE_ENV': '"production"' } });
console.log('Solana offline build: dist/solana/apps/solana-demo/server.js');

copyFileSync('docs/evidence/devnet-delivery-20261103.json', 'dist/solana/apps/solana-demo/evidence.json');
