import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      include: ["src/domain/**/*.ts", "src/application/**/*.ts"],
      provider: "v8",
      reporter: ["text", "json-summary"],
      thresholds: {
        "src/application/**.ts": {
          branches: 85,
          functions: 90,
          lines: 85,
          statements: 85,
        },
        "src/domain/**.ts": {
          branches: 90,
          functions: 90,
          lines: 90,
          statements: 90,
        },
        branches: 85,
        functions: 85,
        lines: 85,
        statements: 85,
      },
    },
    include: ["tests/**/*.test.ts"],
  },
});
