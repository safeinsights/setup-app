import { vanillaExtractPlugin } from '@vanilla-extract/vite-plugin'
import react from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths'
import { defineConfig } from 'vitest/config'
import { testsCoverageSourceFilter } from './tests/coverage.mjs'

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [react(), tsconfigPaths(), vanillaExtractPlugin()],
    test: {
        setupFiles: ['tests/vitest.setup.ts'],
        mockReset: true,
        environment: 'happy-dom',
        reporters: ['verbose'],
        include: ['src/lib/*.(test).{js,jsx,ts,tsx}'],
        coverage: {
            enabled: true,
            reportsDirectory: 'tmp/code-coverage/unit',
            clean: true,
            coverageReportOptions: {
                reports: ['raw', 'console-details', 'v8', 'html'],
                lcov: true,
                outputDir: 'tmp/code-coverage/unit',
                clean: true,
                sourceFilter: testsCoverageSourceFilter,
            },
        },
    },
})
