import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    server: 'src/server.ts',
  },
  format: ['esm'],
  target: 'node22',
  clean: true,
  splitting: false,
  sourcemap: true,
  dts: false,
  treeshake: true,
});
