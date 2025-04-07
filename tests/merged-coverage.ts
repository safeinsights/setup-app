import { CoverageReport, type CoverageReportOptions } from 'monocart-coverage-reports'
import { testsCoverageSourceFilter } from './coverage.mjs'

const coverageOptions: CoverageReportOptions = {
    name: 'Coverage Report',
    inputDir: ['./test-results/unit/raw', './test-results/e2e/coverage/raw'],
    outputDir: './test-results/coverage',
    sourceFilter: testsCoverageSourceFilter,
    clean: true,
    reports: ['markdown-summary', 'markdown-details', 'console-details', 'json-summary', 'html'],
}

await new CoverageReport(coverageOptions).generate()
