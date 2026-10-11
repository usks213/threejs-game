import {defineConfig,devices} from '@playwright/test';
/** Isolated real-WebGL mechanism/visual checks, followed by ordinary gameplay
 * acceptance in the existing jobs. Vite serves only the test fixture here. */
export default defineConfig({
 testDir:'./tests/e2e',testMatch:'enshrouded-rendering.spec.ts',workers:1,fullyParallel:false,timeout:120000,retries:0,
 expect:{timeout:30000},reporter:[['list'],['html',{outputFolder:'playwright-report/rendering',open:'never'}]],outputDir:'test-results/rendering',
 use:{baseURL:'http://127.0.0.1:5184',screenshot:'only-on-failure',trace:'retain-on-failure',launchOptions:{args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']}},
 projects:[{name:'desktop-chromium',use:{...devices['Desktop Chrome'],viewport:{width:960,height:540},deviceScaleFactor:1}},{name:'android-chromium',use:{...devices['Pixel 7 landscape'],viewport:{width:844,height:390},deviceScaleFactor:1}}],
 webServer:{command:'npm run dev -- --host 127.0.0.1 --port 5184 --strictPort',url:'http://127.0.0.1:5184',reuseExistingServer:!process.env.CI},
});
