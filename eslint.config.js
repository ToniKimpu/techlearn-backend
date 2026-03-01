import js from "@eslint/js";
import tseslint from "typescript-eslint";
import eslintConfigPrettier from "eslint-config-prettier";

export default tseslint.config(
  // Global ignores
  {
    ignores: ["dist/", "src/generated/", "legacy/", "src/legacy/", "node_modules/"],
  },

  // Base recommended rules
  js.configs.recommended,
  ...tseslint.configs.recommended,

  // Disable rules that conflict with Prettier
  eslintConfigPrettier,

  // Project-wide overrides
  {
    files: ["src/**/*.ts"],
    rules: {
      "no-console": "warn",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },

  // Relax rules for test files
  {
    files: ["src/__tests__/**/*.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "no-console": "off",
    },
  }
);
