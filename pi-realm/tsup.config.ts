import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    'server': 'src/server.ts',
    'client/tui': 'src/client/tui.ts',
  },
  format: ['esm'],
  target: 'node22',
  clean: true,
  splitting: false,
  sourcemap: true,
  dts: false,
  treeshake: true,
});
