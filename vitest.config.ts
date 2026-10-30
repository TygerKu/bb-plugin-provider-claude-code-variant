import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const sdkRoot = fileURLToPath(
  new URL("./node_modules/@get-bb/plugin-sdk", import.meta.url),
);

export default defineConfig({
  resolve: {
    alias: [
      {
        find: "@get-bb/plugin-sdk/testing",
        replacement: `${sdkRoot}/dist/testing/index.js`,
      },
      {
        find: /^@get-bb\/plugin-sdk\/provider-bridge\/testing$/,
        replacement: `${sdkRoot}/dist/provider-bridge-testing.js`,
      },
      {
        find: /^@get-bb\/plugin-sdk\/(.*)$/,
        replacement: `${sdkRoot}/dist/$1.js`,
      },
      {
        find: "@get-bb/plugin-sdk",
        replacement: `${sdkRoot}/dist/index.js`,
      },
    ],
  },
  test: {
    silent: "passed-only",
    name: "bb-plugin-provider-claude-code-variant",
    include: ["src/**/*.test.ts"],
    exclude: ["node_modules/**"],
  },
});
