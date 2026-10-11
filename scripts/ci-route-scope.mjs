// A harness-only correction can retest its failed route without implying that
// all production gameplay was reaccepted. Any other path keeps normal coverage.
const routeTests = new Set([
 'tests/e2e/vertical-navigation.spec.ts',
 'tests/helpers/vertical-route-driver.ts',
 'tests/unit/vertical-route-driver.test.ts',
]);
const allowed = new Set([...routeTests, 'docs/adventure/vertical-navigation-oct09.md']);

/** @param {string[]} paths @param {boolean} manual */
export function routeDiagnosticOnly(paths, manual = false) {
 return !manual && paths.length > 0 && paths.some(path => routeTests.has(path))
  && paths.every(path => allowed.has(path));
}

export const ROUTE_DIAGNOSTIC_GREP = 'voxel adventure continues by walking the ramp';
