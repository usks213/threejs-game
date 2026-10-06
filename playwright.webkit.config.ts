import {defineConfig,devices} from '@playwright/test';

// Separate from the Chromium suite: WebKit has no Chromium CDP touch transport.
// This is Linux WebKit with mobile emulation, not physical iPhone/Safari evidence.
export default defineConfig({
 testDir:'./tests/webkit',
 fullyParallel:false,
 workers:1,
 timeout:180000,
 globalTimeout:540000,
 retries:0,
 expect:{timeout:60000},
 outputDir:'test-results/webkit',
 reporter:[['list'],['html',{outputFolder:'playwright-report/webkit',open:'never'}]],
 use:{
  baseURL:process.env.E2E_BASE_URL??'http://127.0.0.1:4173',
  launchOptions:{args:[]},
  trace:{mode:'retain-on-failure',screenshots:false,snapshots:true,sources:true},
  screenshot:'only-on-failure',
 },
 projects:[{
  name:'mobile-webkit',
  use:{...devices['iPhone 13 landscape'],browserName:'webkit',viewport:{width:844,height:390},deviceScaleFactor:1},
 }],
 webServer:process.env.E2E_BASE_URL?undefined:{
  command:'npm run preview -- --host 127.0.0.1 --port 4173 --strictPort',
  url:'http://127.0.0.1:4173',
  reuseExistingServer:!process.env.CI,
 },
});
