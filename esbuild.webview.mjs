import * as esbuild from 'esbuild';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const watch = process.argv.includes('--watch');

// Shiki's "./*": "./dist/*" wildcard export omits the .mjs extension, which
// esbuild doesn't auto-append when expanding package.json export patterns.
// This plugin rewrites shiki/langs/* and shiki/themes/* to the actual .mjs path.
const shikiPkg = fileURLToPath(import.meta.resolve('shiki/package.json'));
const shikiBase = path.join(path.dirname(shikiPkg), 'dist');
const shikiLangsPlugin = {
  name: 'shiki-subpath',
  setup(build) {
    build.onResolve({ filter: /^shiki\/(langs|themes)\// }, args => ({
      path: path.join(shikiBase, args.path.replace('shiki/', '') + '.mjs'),
    }));
  },
};

// Each Shiki grammar is a dynamic import(), so with splitting it becomes its own file in
// media/chunks/ that the webview loads only when the preview needs that language. Chunk names
// carry a content hash, so stale ones from earlier builds are removed first.
fs.rmSync('media/chunks', { recursive: true, force: true });

const ctx = await esbuild.context({
  entryPoints: { webview: 'src/webview/main.ts' },
  bundle: true,
  outdir: 'media',
  chunkNames: 'chunks/[name]-[hash]',
  splitting: true,
  format: 'esm',
  platform: 'browser',
  target: ['chrome108'],
  sourcemap: false,
  minify: false,
  external: [],
  define: {
    'acquireVsCodeApi': 'acquireVsCodeApi',
  },
  plugins: [shikiLangsPlugin],
  banner: {
    js: '/* generated — edit src/webview/ instead */',
  },
});

if (watch) {
  await ctx.watch();
  console.log('Watching src/webview/ for changes…');
} else {
  await ctx.rebuild();
  await ctx.dispose();
  console.log('Webview bundle written to media/webview.js');
}
