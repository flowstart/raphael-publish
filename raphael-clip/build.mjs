import { build } from 'esbuild';
import { cpSync, mkdirSync } from 'fs';

mkdirSync('dist', { recursive: true });
cpSync('public', 'dist', { recursive: true });

await build({
  entryPoints: {
    content: 'src/content/content.ts',
    preview: 'src/preview/preview.ts',
    background: 'src/background.ts',
  },
  bundle: true,
  outdir: 'dist',
  format: 'iife',
  minify: true,
  logLevel: 'info',
});
