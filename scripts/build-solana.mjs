import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { copyFileSync, mkdirSync } from 'node:fs';
const require = createRequire(import.meta.url);
execFileSync(process.execPath, [require.resolve('typescript/bin/tsc'), '-p', 'tsconfig.solana.json', '--noEmit', 'false', '--outDir', 'dist/solana'], { stdio: 'inherit' });
mkdirSync('dist/solana/apps/solana-demo', { recursive: true });
for (const file of ['index.html', 'style.css', 'app.js']) copyFileSync(`apps/solana-demo/${file}`, `dist/solana/apps/solana-demo/${file}`);
console.log('Solana offline build: dist/solana/apps/solana-demo/server.js');
