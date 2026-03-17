import * as esbuild from 'esbuild';

const watch = process.argv.includes('--watch');

const ctx = await esbuild.context({
  entryPoints: ['src/webview/main.ts'],
  bundle: true,
  outfile: 'media/webview.js',
  format: 'iife',
  platform: 'browser',
  target: ['chrome108'],
  sourcemap: false,
  minify: false,
  // acquireVsCodeApi is a global provided by the VS Code webview runtime
  external: [],
  define: {
    'acquireVsCodeApi': 'acquireVsCodeApi',
  },
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
