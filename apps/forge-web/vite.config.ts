import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "./",
  plugins: [react()],
  build: {
    manifest: true,
    sourcemap: true,
    target: "es2022",
  },
});
