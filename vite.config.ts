import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: { target: 'es2022', chunkSizeWarningLimit: 2000 },
  // `npm run sim` runs the long headless bot matches (tests/*.sim.ts) separately from unit tests
  test: { include: process.env.SIM ? ['tests/**/*.sim.ts'] : ['tests/**/*.test.ts'], environment: 'node' },
} as never);
