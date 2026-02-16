import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { logApiPlugin } from "./src/logApiPlugin";

export default defineConfig({
  plugins: [react(), tailwindcss(), logApiPlugin()],
  server: {
    port: 3101,
    open: true,
  },
});
