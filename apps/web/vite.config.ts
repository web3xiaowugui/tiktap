import { fileURLToPath, URL } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const webSrc = fileURLToPath(new URL("./src", import.meta.url));
const sharedSrc = fileURLToPath(new URL("../../packages/shared/src", import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: [
      // 共享包在 workspace 里没有产物，直接把子路径映射到源码目录。
      { find: "@tiktap/shared", replacement: sharedSrc },
      { find: "@", replacement: webSrc },
    ],
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
    proxy: {
      // 后端跑在 8787，前端只认 /api，避免跨域。
      "/api": {
        target: "http://127.0.0.1:8787",
        changeOrigin: false,
      },
    },
    watch: {
      // Editors may write atomically via temp dirs; watching those briefly
      // existing files can crash the dev server with EBUSY on Windows.
      ignored: ["**/*.tmpdir/**", "**/*.tmp"],
    },
  },
});
