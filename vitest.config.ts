import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@core': resolve(__dirname, 'src/core'),
      '@shared': resolve(__dirname, 'src/shared')
    }
  },
  test: {
    include: process.env.CALIBRATE ? ['test/calibration/*.calib.ts'] : ['src/**/*.test.ts', 'test/**/*.test.ts'],
    testTimeout: 120_000
  }
})
