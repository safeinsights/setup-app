export const SOURCE_MATCHER = /src\/(lib|scripts)\//

export function testsCoverageSourceFilter(sourcePath) {
    return sourcePath.search(SOURCE_MATCHER) !== -1
}
