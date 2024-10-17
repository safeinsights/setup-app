import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths'
import { vanillaExtractPlugin } from '@vanilla-extract/vite-plugin'

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [react(), tsconfigPaths(), vanillaExtractPlugin()],
    test: {
        mockReset: true,
        environment: 'happy-dom',
        include: ['src/**/*.(test).{js,jsx,ts,tsx}'],
        coverage: {
            enabled: true,
            // skipFull: true,
            // FIXME: In the future, when we're ready, we should re-enable this threshold check
            // thresholds: { 100: true },
            include: ['src/**/*.{js,jsx,ts,tsx}'],
        },
    },
})
