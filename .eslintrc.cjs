module.exports = {
  root: true,
  parser: "@typescript-eslint/parser",
  extends: [
    "next/core-web-vitals",
    "plugin:@typescript-eslint/recommended",
    "plugin:react-hooks/recommended",
  ],
  plugins: ["@typescript-eslint", "unused-imports"],
  ignorePatterns: [
    "node_modules/*",
    ".next/*",
    "out/*",
    "build/*",
    "next-env.d.ts",
  ],
  rules: {
    "unused-imports/no-unused-imports": "error",
    "@typescript-eslint/no-unused-vars": [
      "warn",
      { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
    ],
    "@typescript-eslint/no-explicit-any": "warn",
    "@typescript-eslint/no-require-imports": "off",
    "@typescript-eslint/no-var-requires": "off",
    "@typescript-eslint/no-empty-object-type": "off",
    "react-hooks/exhaustive-deps": "warn",
  },
  overrides: [
    {
      files: ["src/app/api/**/*"],
      rules: {
        "@typescript-eslint/no-explicit-any": "error",
      },
    },
  ],
};
