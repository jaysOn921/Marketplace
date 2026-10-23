import { defineConfig } from 'tsup';

export default defineConfig({
  // The seed is built too, so production containers can create reference data and the admin.
  entry: { server: 'src/server.ts', seed: 'prisma/seed.ts' },
  format: ['esm'],
  target: 'node22',
  platform: 'node',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  // Workspace packages ship TypeScript source, so bundle them into the build.
  noExternal: [/^@tzed\//],
});
