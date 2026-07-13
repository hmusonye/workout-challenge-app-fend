import{defineConfig}from"vitest/config";export default defineConfig({test:{include:["**/*.test.ts"],exclude:["tests/e2e/**","node_modules/**",".next/**"]}})
