import { fileURLToPath, URL } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  /*
   * The React plugin exists for a single file, `ui/capture.test.ts`: it mounts
   * `SolDeMayo.tsx` because the exported render must be the component's own, not a
   * second drawing built beside it.
   *
   * The environment stays `node` by default. A DOM is requested per file, at the top
   * of the one that needs it (`// @vitest-environment happy-dom`), which keeps the
   * suite fast.
   */
  plugins: [react()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) }
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts']
  }
})
