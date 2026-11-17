import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

/** In dev, `/api` is forwarded to the local Worker (`npm run dev -w @orbit/api`), so the browser sees one origin. */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: { "/api": env.ORBIT_API_PROXY || "http://127.0.0.1:8787" },
    },
  };
});
