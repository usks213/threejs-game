import { defineConfig } from 'vitest/config';
const deploymentCommit=process.env.DEPLOYMENT_COMMIT_SHA??process.env.WORKERS_CI_COMMIT_SHA??process.env.CF_PAGES_COMMIT_SHA??process.env.GITHUB_SHA??'local';

export default defineConfig({
  define:{__COOP_BUILD_ID__:JSON.stringify(deploymentCommit)},
  server: { proxy: { "/coop": { target: "http://127.0.0.1:2568", ws: true } } },
  preview: { proxy: { "/coop": { target: "http://127.0.0.1:2568", ws: true } } },
  plugins: [{
    name: 'deployment-version',
    apply: 'build',
    generateBundle() {
      const commit = process.env.DEPLOYMENT_COMMIT_SHA
        ?? process.env.WORKERS_CI_COMMIT_SHA
        ?? process.env.CF_PAGES_COMMIT_SHA
        ?? process.env.GITHUB_SHA
        ?? 'local';
      this.emitFile({
        type: 'asset',
        fileName: 'deployment.json',
        source: JSON.stringify({ application: 'threejs-game', commit }),
      });
    },
  }],
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
    maxWorkers: 2,
  },
});
