import {readFileSync, mkdirSync, writeFileSync} from 'node:fs';

const types = {
  'index.html': 'text/html; charset=utf-8',
  'style.css': 'text/css; charset=utf-8',
  'app.js': 'text/javascript; charset=utf-8',
  'assets/lampung.webp': 'image/webp',
  'assets/map.webp': 'image/webp',
  'assets/treasure.webp': 'image/webp',
  'assets/guidebook.webp': 'image/webp',
  'assets/logo.webp': 'image/webp',
  'assets/cartoon-waves.svg': 'image/svg+xml',
};
const assets = Object.fromEntries(Object.entries(types).map(([file, type]) => [
  '/' + file, [type, readFileSync(new URL('../dist/' + file, import.meta.url)).toString('base64')],
]));
const source = readFileSync(new URL('./index.mjs', import.meta.url), 'utf8');
const output = new URL('../dist/server/', import.meta.url);
mkdirSync(output, {recursive: true});
writeFileSync(new URL('index.js', output), 'const assets = ' + JSON.stringify(assets) + ';\n' + source);
