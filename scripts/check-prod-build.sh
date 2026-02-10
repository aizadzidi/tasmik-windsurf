#!/bin/sh
set -e
bash scripts/check-no-sensitive-student-dumps.sh
npm run build
npm run lint

if [ -x node_modules/.bin/vitest ]; then
  npm run test
else
  echo "Skipping tests: vitest is not installed in node_modules."
fi
