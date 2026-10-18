import { defineConfig } from 'vitest/config'

// Relative build paths so the same dist works at /odinRun2048/ on GitHub Pages.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? './' : '/',
  build: { chunkSizeWarningLimit: 800 },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
}))
