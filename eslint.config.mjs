import { FlatCompat } from "@eslint/eslintrc";
import { createRequire } from "module";
import { dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const require = createRequire(import.meta.url);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintrcConfig = require("./.eslintrc.cjs");

export default compat.config(eslintrcConfig);
