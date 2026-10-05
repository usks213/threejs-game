import {CAMPAIGN_PROTOCOL} from './src/prototype/network/protocol';
import { defineConfig } from 'vitest/config';

export default defineConfig({
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
        source: JSON.stringify({ application: 'threejs-game', commit, campaignProtocol: CAMPAIGN_PROTOCOL, campaignCoop: process.env.PR4_CAMPAIGN_RELAY_ENABLED === 'true' }),
      });
    },
  }],
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
    maxWorkers: 2,
  },
});
