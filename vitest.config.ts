import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    exclude: [
      '**/.claude/**',
      '**/.worktrees/**',
      '**/node_modules/**',
      '**/dist/**',
      '**/.next/**',
    ],
    coverage: {
      provider: 'v8',
      include: ['lib/**/*.ts'],
      exclude: ['lib/supabase/types.ts'],
      thresholds: {
        'lib/calculator.ts': {
          100: true,
        },
        'lib/progress-invoices/calculation.ts': {
          statements: 100,
          lines: 100,
          functions: 100,
        },
        'lib/actions/**/*.ts': {
          statements: 80,
          lines: 80,
          functions: 80,
        },
      },
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, '.'),
    },
  },
})
