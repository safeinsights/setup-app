import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths'
import { vanillaExtractPlugin } from '@vanilla-extract/vite-plugin'

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [react(), tsconfigPaths(), vanillaExtractPlugin()],
    test: {
        setupFiles: ['./tests/vitest.setup.ts'],
        mockReset: true,
        environment: 'happy-dom',
        include: ['src/lib/*.(test).{js,jsx,ts,tsx}'],
        coverage: {
            enabled: true,
            // skipFull: true,
            thresholds: { 100: true },
            include: ['src/lib/*.{js,jsx,ts,tsx}'],
        },
    },
})
