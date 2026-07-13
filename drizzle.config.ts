import { defineConfig } from "drizzle-kit";
export default defineConfig({out:"./db/migrations",schema:"./db/schema.ts",dialect:"postgresql",dbCredentials:{url:process.env.DATABASE_URL||"postgresql://challenge_app:change-me@localhost:5432/challenge_tracker"}});
