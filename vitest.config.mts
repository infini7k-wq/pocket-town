import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // 自動プレイで何十年も進めるテストがあるので、GitHub Actions の遅いマシンでも落ちないよう長めに
    testTimeout: 30_000,
  },
});
