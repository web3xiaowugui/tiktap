import { fileURLToPath, URL } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const webSrc = fileURLToPath(new URL("./src", import.meta.url));
const sharedSrc = fileURLToPath(new URL("../../packages/shared/src", import.meta.url));
const apiTarget = process.env.VITE_API_TARGET ?? "http://127.0.0.1:8787";
const port = Number(process.env.VITE_PORT ?? 5173);

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
    // 公网隧道（cloudflared）的域名要放行，否则 Vite 会 403 Blocked request。
    allowedHosts: true,
    port,
    proxy: {
      // 单后端 /api，环境由请求参数 env 决定。
      "/api": {
        target: apiTarget,
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
