import { fileURLToPath, URL } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
    watch: {
      // Editors may write atomically via temp dirs; watching those briefly
      // existing files can crash the dev server with EBUSY on Windows.
      ignored: ["**/*.tmpdir/**", "**/*.tmp"],
    },
  },
});
