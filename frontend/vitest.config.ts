import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  test: {
    env: { VITE_DEMO_MODE: "true" },
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
    clearMocks: true,
  },
});
