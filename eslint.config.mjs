import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/.next/**",
      "**/build/**",
      "**/coverage/**",
      "**/node_modules/**",
      "packages/contracts/src/generated/**",
      "prototype/**"
    ]
  },
  ...tseslint.configs.recommended
);
