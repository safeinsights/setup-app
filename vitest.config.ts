import { vanillaExtractPlugin } from '@vanilla-extract/vite-plugin'
import react from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths'
import { defineConfig } from 'vitest/config'
import { testsCoverageSourceFilter } from './tests/coverage.mjs'

const IS_CI = !!process.env.CI
// https://vitejs.dev/config/
export default defineConfig({
    plugins: [react(), tsconfigPaths(), vanillaExtractPlugin()],
    test: {
        setupFiles: ['tests/vitest.setup.ts'],
        mockReset: true,
        environment: 'happy-dom',

        reporters: IS_CI ? ['github-actions'] : ['verbose'],
        include: ['src/lib/*.(test).{js,jsx,ts,tsx}'],
        coverage: {
            enabled: Boolean(IS_CI || process.env.COVERAGE),
            thresholds: { 100: true },
            include: ['src/lib/*.{js,jsx,ts,tsx}'],
            reportsDirectory: 'test-results/unit',
            clean: true,
            coverageReportOptions: {
                reports: ['raw', 'console-details', 'v8', 'html'],
                outpuDir: 'test-results/unit',
                clean: true,
                lcov: true,
                filter: { '**/*.css': false, '**/*': true },
                sourceFilter: testsCoverageSourceFilter,
            },
            provider: 'custom',
            customProviderModule: 'vitest-monocart-coverage',
        } as any, // eslint-disable-line
    },
})
