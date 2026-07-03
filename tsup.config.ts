import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: { cli: 'src/cli.ts' },
    format: ['esm'],
    target: 'node18',
    platform: 'node',
    outDir: 'dist',
    clean: true,
    sourcemap: true,
    banner: { js: '#!/usr/bin/env node' },
    splitting: false,
    shims: false,
    dts: false,
    external: ['sharp']
  },
  {
    entry: { index: 'src/index.ts' },
    format: ['esm', 'cjs'],
    target: 'node18',
    platform: 'node',
    outDir: 'dist',
    clean: false,
    sourcemap: true,
    dts: true,
    splitting: false,
    shims: false,
    external: ['sharp']
  }
]);
