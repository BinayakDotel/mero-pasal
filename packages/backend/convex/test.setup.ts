/// <reference types="vite/client" />
// Every Convex module, for convex-test (it locates `_generated/api.js` in this map). Tests,
// type declarations and this file are not Convex function modules.
export const modules = import.meta.glob([
  "./**/*.ts",
  "./**/*.js",
  "!./**/*.test.ts",
  "!./**/*.d.ts",
  "!./test.setup.ts",
]);
