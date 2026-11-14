import {cpSync} from 'node:fs';
import {build} from 'esbuild';
cpSync('dist/index.html', 'public/index.html');
cpSync('vercel/admin-theme.css', 'public/admin-theme.css');
cpSync('dist/style.css', 'public/style.css');
cpSync('dist/assets', 'public/assets', {recursive: true});
await build({entryPoints: ['vercel/client.mjs'], bundle: true, outfile: 'public/app.js', define: {'process.env.NODE_ENV': '"production"'}});
