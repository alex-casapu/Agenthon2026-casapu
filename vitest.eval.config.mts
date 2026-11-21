import { defineConfig } from "vitest/config";
import path from "node:path";

// Live evaluations (call the model). Not part of `npm test`.
export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  test: { environment: "node", include: ["src/**/*.eval.ts"], testTimeout: 900_000 },
});
