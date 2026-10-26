import { defineConfig } from 'vite';

// SINGLE=1 builds one self-contained HTML file (fonts and code inlined) for phone sharing.
const single = !!process.env.SINGLE;

export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 2000,
    ...(single ? { outDir: 'dist-single', assetsInlineLimit: 100_000_000, cssCodeSplit: false, modulePreload: false } : {}),
  },
  // `npm run sim` runs the long headless bot matches (tests/*.sim.ts) separately from unit tests
  test: { include: process.env.SIM ? ['tests/**/*.sim.ts'] : ['tests/**/*.test.ts'], environment: 'node' },
} as never);
