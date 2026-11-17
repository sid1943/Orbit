import { defineConfig } from "vitest/config";

/** Tests cover the plain modules (API client, greeting, kinds), so they run in Node without the React plugin. */
export default defineConfig({ test: { include: ["test/**/*.test.ts"] } });
