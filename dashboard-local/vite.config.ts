import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { logApiPlugin } from "./src/logApiPlugin";
import { agentGraphPlugin } from "./src/agentGraphPlugin";

export default defineConfig({
  plugins: [react(), tailwindcss(), logApiPlugin(), agentGraphPlugin()],
  server: {
    port: 3101,
    open: true,
  },
});
