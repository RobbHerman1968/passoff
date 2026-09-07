import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // Data-fetch and sessionStorage hydration in client workspaces use effects intentionally.
      "react-hooks/set-state-in-effect": "off",
      "@next/next/no-img-element": "off",
    },
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Prototype / deferred Figma handoff surfaces — not first-release paths.
    "src/app/prototypes/**",
    "src/app/projects/**",
    "src/app/dashboard/projects-dashboard.tsx",
    "figma-plugin/**",
  ]),
]);

export default eslintConfig;
