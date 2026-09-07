import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(import.meta.dirname, '..');
const forbidden = [/toolkit_new/i, /\/Users\//, /server\/src\/(?:config|db|routes|billing|auth)/];
const ignored = new Set(['.git', '.gstack', 'node_modules']);
const failures = [];

function visit(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue;
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) visit(full);
    else if (/\.(?:js|mjs|ts|json|md|html|ya?ml)$/.test(entry.name)) {
      if (full === fileURLToPath(import.meta.url)) continue;
      const content = fs.readFileSync(full, 'utf8');
      for (const pattern of forbidden) if (pattern.test(content)) failures.push(`${path.relative(root, full)} matches ${pattern}`);
    }
  }
}

visit(root);
if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('private import boundary: ok');
