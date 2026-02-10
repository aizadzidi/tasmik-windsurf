#!/bin/sh
set -eu

BLOCKED_FILES="
data_online_students.csv
2026-02-09_online_students_from_csv.sql
"

for file in $BLOCKED_FILES; do
  if git ls-files --error-unmatch "$file" >/dev/null 2>&1; then
    echo "ERROR: Sensitive student dump is tracked in git: $file"
    echo "Move this data to secure storage and keep only sanitized templates in repo."
    exit 1
  fi
done

TRACKED_SQL_CSV="$(git ls-files '*.sql' '*.csv')"
if [ -n "$TRACKED_SQL_CSV" ] && rg -n "student_name_raw|create temporary table _source_rows|Generated from data_online_students.csv" $TRACKED_SQL_CSV >/dev/null 2>&1; then
  echo "ERROR: Potential raw student migration dump markers found in tracked SQL/CSV files."
  echo "Keep raw import dumps out of git."
  exit 1
fi

echo "Sensitive data check passed."
