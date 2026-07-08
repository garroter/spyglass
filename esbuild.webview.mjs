import * as esbuild from 'esbuild';

const watch = process.argv.includes('--watch');

// Shiki's "./*": "./dist/*" wildcard export omits the .mjs extension, which
// esbuild doesn't auto-append when expanding package.json export patterns.
// This plugin rewrites shiki/langs/* and shiki/themes/* to the actual .mjs path.
const shikiBase = new URL('../shiki/dist/', import.meta.resolve('shiki/package.json')).pathname;
const shikiLangsPlugin = {
  name: 'shiki-subpath',
  setup(build) {
    build.onResolve({ filter: /^shiki\/(langs|themes)\// }, args => ({
      path: shikiBase + args.path.replace('shiki/', '') + '.mjs',
    }));
  },
};

const ctx = await esbuild.context({
  entryPoints: ['src/webview/main.ts'],
  bundle: true,
  outfile: 'media/webview.js',
  format: 'iife',
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
