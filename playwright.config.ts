import{defineConfig,devices}from"@playwright/test";export default defineConfig({testDir:"./tests/e2e",fullyParallel:false,retries:0,use:{baseURL:"http://127.0.0.1:3107",...devices["Pixel 7"]},webServer:{command:"npm run build && npm run start -- --hostname 127.0.0.1 --port 3107",url:"http://127.0.0.1:3107",reuseExistingServer:false,timeout:120000,env:{AUTH_SECRET:"test-only-secret-with-at-least-32-characters",AUTH_TRUST_HOST:"true",PORT:"3107",HOSTNAME:"127.0.0.1"}}})





