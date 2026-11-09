import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
    plugins: [react(), tailwindcss()],
    build: {
      rollupOptions: { output: { manualChunks: {
        react: ["react", "react-dom", "react-router-dom"],
        forms: ["react-hook-form", "@hookform/resolvers", "zod"],
        data: ["axios", "@tanstack/react-query"],
      } } },
    },
    server: {
      port: 5173,
      strictPort: true,
      proxy:
        env.VITE_DEMO_MODE !== "false"
          ? {
              "/demo-api": {
                target: "http://127.0.0.1:3001",
                rewrite: (p) => p.replace(/^\/demo-api/, ""),
              },
            }
          : undefined,
    },
  };
});
