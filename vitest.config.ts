import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    exclude: [
      "shared/mcp-servers/**",
      "dashboard-local/**",
      "ralph-dashboard/**",
      "ralphchives/**",
    ],
  },
});
